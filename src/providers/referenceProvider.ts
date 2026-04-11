import * as vscode from 'vscode';
import { ProjectManager } from '../project/projectManager';

export class VerilogReferenceProvider implements vscode.ReferenceProvider {
    constructor(private projectManager: ProjectManager) {}

    public provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Location[]> {
        
        const range = document.getWordRangeAtPosition(position);
        if (!range) {return null;}
        
        const word = document.getText(range);

        // 1. Phase 5: 局部信号的 Find All References
        const currentModules = this.projectManager.getModulesInFile(document.uri.fsPath);
        for (const mod of currentModules) {
            if (mod.range.contains(position)) {
                // 如果光标位于模块内部，看看是不是悬停在某个信号上
                const sym = mod.symbols.find(s => s.name === word);
                if (sym) {
                    return sym.references.map(r => new vscode.Location(sym.fileUri, r));
                }
            }
        }

        // 2. 模块级跨文件 Find All References
        // 如果上面没找到，或者光标在模块名上，寻找所有实例化该模块的地方
        const moduleDef = this.projectManager.getModule(word);
        if (moduleDef) {
            const locations: vscode.Location[] = [];
            
            // 是否包含声明位置
            if (context.includeDeclaration) {
                locations.push(new vscode.Location(moduleDef.fileUri, moduleDef.nameRange || moduleDef.range));
            }

            // 搜索所有模块内是否有类型为 word 的实例化
            for (const otherMod of this.projectManager.getAllModules()) {
                const instances = otherMod.instances.filter(i => i.type === word);
                for (const inst of instances) {
                    locations.push(new vscode.Location(inst.fileUri, inst.range));
                }
            }
            return locations;
        }

        return null;
    }
}
