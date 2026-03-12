import * as vscode from 'vscode';
import { ProjectManager } from '../project/projectManager';

export class SimCodeLensProvider implements vscode.CodeLensProvider {
    constructor(private projectManager: ProjectManager) {}

    public provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens[]> {
        
        const lenses: vscode.CodeLens[] = [];
        
        // 查找当前文件中的所有模块
        const modules = this.projectManager.getModulesInFile(document.uri.fsPath);

        for (const mod of modules) {
            // 简单的 Testbench 启发式判断：如果没有端口，或者名字以 tb_ 开头
            const isTestbench = mod.ports.length === 0 || mod.name.toLowerCase().startsWith('tb');
            
            if (isTestbench) {
                // 找到 module 定义的起始行（即光标悬浮显示按钮的位置）
                const line = mod.nameRange ? mod.nameRange.start.line : mod.range.start.line;
                const lensRange = new vscode.Range(line, 0, line, 0);

                // Run Simulation 按钮
                const runSimCmd: vscode.Command = {
                    title: '▶️ Run Simulation',
                    command: 'hdl-helper.runSimulation',
                    arguments: [mod.name] // 将模块名传给执行命令
                };
                lenses.push(new vscode.CodeLens(lensRange, runSimCmd));

                // View Waveform 按钮 (假设 build 目录下生成了同名的 .fst)
                // 如果没有找到 fst，降级成 vcd
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
                const fstPath = vscode.Uri.file(`${workspaceFolder}/build/${mod.name}.fst`).fsPath;
                
                const viewWaveCmd: vscode.Command = {
                    title: '📊 View Waveform',
                    command: 'hdl-helper.viewWaveform',
                    arguments: [fstPath]
                };
                lenses.push(new vscode.CodeLens(lensRange, viewWaveCmd));
            }
        }

        return lenses;
    }
}
