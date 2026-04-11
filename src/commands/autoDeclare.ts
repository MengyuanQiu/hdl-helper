import * as vscode from 'vscode';
import { CodeGenerator } from '../utils/codeGenerator'; // 👈 复用统一的解析器

export async function autoDeclareSignals() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {return;}

    const selection = editor.selection;
    const text = editor.document.getText(selection);

    // 1. 校验选中内容
    if (!text.trim()) {
        vscode.window.showErrorMessage('请先选中一段包含例化的代码 (带 // 注释)');
        return;
    }

    // 2. 调用统一解析器 (CodeGenerator)
    // 这一步会解析出所有带 // 注释的端口
    const parsedPorts = CodeGenerator.parseSelectedInstantiation(text);

    if (parsedPorts.length === 0) {
        vscode.window.showWarningMessage('未识别到有效信号。请确保选中了包含端口连接的例化代码，例如 .port_name(signal_name)');
        return;
    }

    // 3. 读取用户配置 (支持 logic / wire / reg)
    const config = vscode.workspace.getConfiguration('hdl-helper');
    const signalType = config.get<string>('signalType', 'logic'); // 默认为 logic

    // 4. 过滤与构建
    // 不需要重复声明的全局信号
    const ignoreList = new Set(['clk', 'rst_n', 'rst', 'clock', 'reset', 'clk_i', 'rst_ni']);
    
    const uniqueSignals = new Set<string>();
    const declarations: string[] = [];

    // 为了美观，计算一下位宽的最大长度，用于对齐 (可选优化)
    // 这里我们先做简单拼接，VS Code 的 Formatter 会负责最终对齐

    parsedPorts.forEach(port => {
        // 过滤全局信号
        if (ignoreList.has(port.name)) {return;}
        
        // 去重
        if (uniqueSignals.has(port.name)) {return;}
        uniqueSignals.add(port.name);

        // 提取位宽
        // parseSelectedInstantiation 返回的 type 可能是 "logic [31:0]" 或者 "logic"
        // 我们需要把 "[31:0]" 抠出来，拼上用户设置的 signalType
        const widthMatch = port.type.match(/\[.*?\]/);
        const width = widthMatch ? ` ${widthMatch[0]}` : '';

        // 拼接: logic [31:0] data_in;
        // 如果没有位宽，为了对齐好看，加几个空格 (Formatter 也会修整)
        const padding = width ? '' : '       '; 
        
        declarations.push(`${signalType}${width}${padding} ${port.name};`);
    });

    if (declarations.length === 0) {
        vscode.window.showInformationMessage('选中的信号似乎都是时钟/复位，或者已存在，无需声明。');
        return;
    }

    // 5. 插入代码
    const insertBlock = declarations.join('\n') + '\n\n';

    await editor.edit(editBuilder => {
        editBuilder.insert(selection.start, insertBlock);
    });

    vscode.window.showInformationMessage(`✅ 已自动声明 ${declarations.length} 个信号 (${signalType})！`);
}