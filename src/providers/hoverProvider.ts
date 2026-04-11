import * as vscode from 'vscode';
import { ProjectManager } from '../project/projectManager';
import { HdlModule, HdlSymbol } from '../project/hdlSymbol';
import * as path from 'path';

export class VerilogHoverProvider implements vscode.HoverProvider {
    constructor(private projectManager: ProjectManager) {}

    public provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        
        // 1. 获取当前鼠标悬停的单词
        const range = document.getWordRangeAtPosition(position);
        if (!range) {return null;}
        
        const word = document.getText(range);

        // 2. 这是一个模块名吗？
        const hdlModule = this.projectManager.getModule(word);
        
        if (hdlModule) {
            return this.buildModuleHover(hdlModule);
        }

        // 3. Phase 5: 这是一个局部信号/局部参数吗？
        const currentModules = this.projectManager.getModulesInFile(document.uri.fsPath);
        for (const mod of currentModules) {
            if (mod.range.contains(position)) {
                const sym = mod.symbols.find(s => s.name === word);
                if (sym) {
                    return this.buildSymbolHover(sym);
                }
            }
        }

        return null;
    }

    private buildSymbolHover(sym: HdlSymbol): vscode.Hover {
        const md = new vscode.MarkdownString();
        
        // 标识符种类图标
        const icon = sym.kind === 'port' ? '🔌' : 
                     sym.kind === 'parameter' || sym.kind === 'localparam' ? '⚙️' : '📌';
        
        // --- 类型签名 ---
        // 参数/端口可能自己带有完整声明文本，如 "parameter WIDTH = 32" 或 "input wire clk"
        // 普通信号如 "wire [31:0]"，需拼上信号名
        let sigText = sym.type;
        if (sym.kind !== 'parameter' && sym.kind !== 'localparam' && !sigText.endsWith(sym.name)) {
            sigText = `${sym.type} ${sym.name};`;
        }

        md.appendMarkdown(`### ${icon} ${sym.kind}: **${sym.name}**\n`);
        md.appendMarkdown(`---\n`);
        md.appendCodeblock(sigText, 'verilog');
        
        // --- 提取的源码注释 ---
        if (sym.comment) {
            md.appendMarkdown(`\n> ${sym.comment}\n`);
        }
        
        md.appendMarkdown(`\n*(Declared at line ${sym.range.start.line + 1})*`);
        
        md.isTrusted = true;
        return new vscode.Hover(md);
    }

    private buildModuleHover(module: HdlModule): vscode.Hover {
        const md = new vscode.MarkdownString();
        
        // --- 标题 ---
        md.appendMarkdown(`### 📦 Module: **${module.name}**\n`);
        md.appendMarkdown(`--- \n`);
        
        // --- 所在文件 ---
        md.appendMarkdown(`📍 *File: ${path.basename(module.fileUri.fsPath)}* \n\n`);

        // --- 参数列表 (Parameters) ---
        if (module.params.length > 0) {
            md.appendMarkdown(`#### ⚙️ Parameters:\n`);
            md.appendCodeblock(
                module.params.map(p => `${p.name} = ${p.defaultValue}`).join('\n'), 
                'verilog'
            );
        }

        // --- 端口列表 (Ports) ---
        // 我们简单分类一下 input 和 output，看起来更清晰
        if (module.ports.length > 0) {
            const inputs = module.ports.filter(p => p.dir === 'input');
            const outputs = module.ports.filter(p => p.dir === 'output');
            const inouts = module.ports.filter(p => p.dir === 'inout');

            md.appendMarkdown(`#### 🔌 Ports:\n`);
            
            // 构造端口显示的辅助函数
            const formatPorts = (ports: typeof module.ports) => 
                ports.map(p => `${p.dir.padEnd(6)} ${p.type} ${p.name}`).join('\n');

            let portText = '';
            if (inputs.length) {portText += `// Inputs\n${formatPorts(inputs)}\n`;}
            if (outputs.length) {portText += `// Outputs\n${formatPorts(outputs)}\n`;}
            if (inouts.length) {portText += `// Inouts\n${formatPorts(inouts)}\n`;}

            md.appendCodeblock(portText, 'verilog');
        } else {
            md.appendMarkdown(`*(No ports detected or parsing failed)*`);
        }

        // 允许 Markdown 里的内容支持命令链接 (可选)
        md.isTrusted = true;

        return new vscode.Hover(md);
    }
}