import * as vscode from 'vscode';
import { ProjectManager } from '../project/projectManager';

export class VerilogRenameProvider implements vscode.RenameProvider {
    constructor(private projectManager: ProjectManager) {}

    public prepareRename(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Range | { range: vscode.Range; placeholder: string }> {
        const range = document.getWordRangeAtPosition(position);
        if (!range) {throw new Error('Cannot rename this element.');}
        return range;
    }

    public async provideRenameEdits(
        document: vscode.TextDocument,
        position: vscode.Position,
        newName: string,
        token: vscode.CancellationToken
    ): Promise<vscode.WorkspaceEdit | null> {
        
        const range = document.getWordRangeAtPosition(position);
        if (!range) {return null;}
        
        const word = document.getText(range);
        const edit = new vscode.WorkspaceEdit();

        // 1. 局部信号/参数重命名
        const currentModules = this.projectManager.getModulesInFile(document.uri.fsPath);
        let foundLocal = false;
        for (const mod of currentModules) {
            if (mod.range.contains(position)) {
                const sym = mod.symbols.find(s => s.name === word);
                if (sym) {
                    foundLocal = true;
                    // 将该符号的所有引用（含声明）进行替换
                    for (const ref of sym.references) {
                        edit.replace(sym.fileUri, ref, newName);
                    }
                    break;
                }
            }
        }

        if (foundLocal) {
            return edit;
        }

        // 2. 跨文件模块重命名
        const moduleDef = this.projectManager.getModule(word);
        if (moduleDef) {
            // 模块在定义处的重命名
            edit.replace(moduleDef.fileUri, moduleDef.nameRange || moduleDef.range, newName);
            
            // 所有实例化了该模块的地方
            for (const otherMod of this.projectManager.getAllModules()) {
                const instances = otherMod.instances.filter(i => i.type === word);
                for (const inst of instances) {
                    // P8 Fix: 找到模块类型名在实例化所在文件中的精确位置
                    // inst.range 指向实例名 (u_xxx)，类型名在其前方
                    const typeRange = await this.findTypeNameRange(inst.fileUri, inst.range, word);
                    if (typeRange) {
                        edit.replace(inst.fileUri, typeRange, newName);
                    }
                }
            }
            return edit;
        }

        return null;
    }

    /**
     * 在实例化行附近查找模块类型名的精确位置
     * 实例化格式: module_type [#(...)] instance_name (...)
     * inst.range 指向 instance_name，类型名在其前方
     */
    private async findTypeNameRange(
        fileUri: vscode.Uri,
        instRange: vscode.Range,
        typeName: string
    ): Promise<vscode.Range | null> {
        try {
            const doc = await vscode.workspace.openTextDocument(fileUri);
            const fullText = doc.getText();
            if (!doc.getText(instRange).trim()) {
                return null;
            }

            const instOffset = doc.offsetAt(instRange.start);
            const windowStart = Math.max(0, instOffset - 5000);
            const searchText = fullText.slice(windowStart, instOffset);

            const regex = new RegExp(`\\b${this.escapeRegExp(typeName)}\\b`, 'g');
            let match: RegExpExecArray | null;
            let bestOffset = -1;

            while ((match = regex.exec(searchText)) !== null) {
                const candidateOffset = windowStart + match.index;
                const middle = fullText.slice(candidateOffset + typeName.length, instOffset);
                if (!this.isValidTypeToInstanceGap(middle)) {
                    continue;
                }
                bestOffset = candidateOffset;
            }

            if (bestOffset >= 0) {
                const start = doc.positionAt(bestOffset);
                const end = doc.positionAt(bestOffset + typeName.length);
                return new vscode.Range(start, end);
            }
        } catch {
            // 如果无法打开文件，跳过
        }
        return null;
    }

    private isValidTypeToInstanceGap(gapText: string): boolean {
        // 先去掉注释，再判断 type 与 instance 之间是否只包含空白或 #(...)
        const withoutComments = gapText
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*$/gm, '')
            .trim();

        if (!withoutComments) {
            return true;
        }

        if (!withoutComments.startsWith('#')) {
            return false;
        }

        const openIdx = withoutComments.indexOf('(');
        if (openIdx < 0) {
            return false;
        }

        const closeIdx = this.findMatchingParen(withoutComments, openIdx);
        if (closeIdx < 0) {
            return false;
        }

        return withoutComments.slice(closeIdx + 1).trim().length === 0;
    }

    private findMatchingParen(text: string, openIdx: number): number {
        let depth = 0;
        for (let i = openIdx; i < text.length; i++) {
            const ch = text[i];
            if (ch === '(') {
                depth++;
            } else if (ch === ')') {
                depth--;
                if (depth === 0) {
                    return i;
                }
            }
        }
        return -1;
    }

    private escapeRegExp(input: string): string {
        return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
