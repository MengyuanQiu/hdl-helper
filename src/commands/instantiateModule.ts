import * as vscode from 'vscode';
import { ProjectManager } from '../project/projectManager';
import { FastParser } from '../project/fastParser';
import { AstParser } from '../project/astParser';
import { CodeGenerator } from '../utils/codeGenerator';

/**
 * 智能例化命令 (Ctrl+Alt+I)
 * 
 * 1. 从 ProjectManager 获取项目中所有模块
 * 2. 弹出 QuickPick 让用户选择要例化的模块
 * 3. 生成例化代码并直接插入光标位置
 * 4. 同时复制到剪贴板
 */
export async function instantiateModule(projectManager: ProjectManager) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('请先打开一个 Verilog/SystemVerilog 文件');
        return;
    }

    // 1. 收集所有可用模块 (项目索引 + 当前文件实时解析)
    let allModules = projectManager.getAllModules();

    // 如果项目索引为空 (可能还没扫描完)，至少解析当前文件
    if (allModules.length === 0) {
        const doc = editor.document;
        const code = doc.getText();
        const uri = doc.uri;
        // 实时解析，与 projectManager 逻辑一致
        let astMods = AstParser.ready ? AstParser.parse(code, uri) : [];
        const fastMods = FastParser.parse(code, uri);
        
        if (astMods.length === 0) {
            astMods = fastMods;
        } else {
            for (const am of astMods) {
                if (am.ports.length === 0 && am.params.length === 0) {
                    const fm = fastMods.find(f => f.name === am.name);
                    if (fm) {
                        am.ports = fm.ports;
                        am.params = fm.params;
                    }
                }
            }
        }
        allModules = astMods;
    }

    if (allModules.length === 0) {
        vscode.window.showErrorMessage('工程中未找到任何模块定义。请等待工程索引完成或检查文件内容。');
        return;
    }

    // 2. 弹出 QuickPick 让用户选择模块
    const items = allModules.map(mod => ({
        label: mod.name,
        description: `${mod.ports.length} ports, ${mod.params.length} params`,
        detail: vscode.workspace.asRelativePath(mod.fileUri),
        module: mod
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: '选择要例化的模块 (Select module to instantiate)',
        matchOnDescription: true,
        matchOnDetail: true
    });

    if (!selected) {return;} // 用户取消

    // 3. 使用统一生成器 (开启 withComments = true，保留注释风格)
    const instCode = CodeGenerator.generateInstantiation(selected.module, true);

    // 4. 直接插入到光标位置
    await editor.edit(editBuilder => {
        editBuilder.insert(editor.selection.active, instCode);
    });

    // 5. 同时复制到剪贴板 (保留原有功能)
    await vscode.env.clipboard.writeText(instCode);

    vscode.window.showInformationMessage(`✅ 已插入 ${selected.module.name} 的例化代码（同时已复制到剪贴板）`);
}