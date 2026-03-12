import * as vscode from 'vscode';
import { FastParser } from '../project/fastParser'; // 👈 使用新解析器
import { CodeGenerator } from '../utils/codeGenerator'; // 👈 使用新生成器

export async function instantiateModule() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('请先打开一个 Verilog/SystemVerilog 文件');
        return;
    }

    const doc = editor.document;
    const code = doc.getText();
    const uri = doc.uri;

    // 1. 使用 V2.0 的 FastParser 解析当前文本
    // 即使文件还没保存，FastParser 也能解析内存中的文本
    const hdlModules = FastParser.parse(code, uri);

    if (!hdlModules || hdlModules.length === 0) {
        vscode.window.showErrorMessage('无法识别模块定义，请检查 module 关键字');
        return;
    }

    // 智能选择光标所在的 module
    let hdlModule = hdlModules[0];
    const cursorLine = editor.selection.active.line;
    for (const m of hdlModules) {
        if (m.range.start.line <= cursorLine) {
            hdlModule = m;
        }
    }

    // 2. 使用统一生成器 (开启 withComments = true，保留你喜欢的注释风格)
    const instCode = CodeGenerator.generateInstantiation(hdlModule, true);

    // 3. 写入剪贴板
    await vscode.env.clipboard.writeText(instCode);
    
    // 4. 提示
    vscode.window.showInformationMessage(`✅ 已复制 ${hdlModule.name} 的例化代码！`);
}