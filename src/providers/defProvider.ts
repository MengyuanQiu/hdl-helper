import * as vscode from 'vscode';
import { ProjectManager } from '../project/projectManager';

export class VerilogDefinitionProvider implements vscode.DefinitionProvider {
    constructor(private projectManager: ProjectManager) {}

    public provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Definition> {
        // 1. 获取当前光标所在的单词范围
        const range = document.getWordRangeAtPosition(position);
        if (!range) {return null;}

        // 2. 获取单词文本 (例如 "sync_fifo_gen" 或 "data_in")
        const word = document.getText(range);

        // 3. 情况 A: 这是一个模块名 (保留原有逻辑，跨文件跳转)
        const hdlModule = this.projectManager.getModule(word);

        if (hdlModule) {
            return new vscode.Location(hdlModule.fileUri, hdlModule.nameRange || hdlModule.range);
        }

        // 4. Phase 5 情况 B: 这是一个局部信号/局部参数 (文件中搜索)
        const currentModules = this.projectManager.getModulesInFile(document.uri.fsPath);
        for (const mod of currentModules) {
            // 定位光标处在哪个 module 上下文里
            if (mod.range.contains(position)) {
                // 查找该模块内部是否有这个信号
                const sym = mod.symbols.find(s => s.name === word);
                if (sym) {
                    // 跳转到信号声明位置
                    return new vscode.Location(sym.fileUri, sym.range);
                }
            }
        }

        return null;
    }
}