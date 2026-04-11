import * as vscode from 'vscode';
import { ProjectManager } from '../project/projectManager';

export class VerilogCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private projectManager: ProjectManager) {}

    public provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        
        const completions: vscode.CompletionItem[] = [];
        const completionLabels = new Set<string>();

        const pushUnique = (item: vscode.CompletionItem) => {
            const label = this.getItemLabel(item.label);
            if (!label || completionLabels.has(label)) {
                return;
            }
            completionLabels.add(label);
            completions.push(item);
        };

        // 1. 提供本地上下文符号 (局部信号，参数，端口)
        //    优先从 ProjectManager 缓存获取
        const currentModules = this.projectManager.getModulesInFile(document.uri.fsPath);

        for (const mod of currentModules) {
            if (mod.range.contains(position)) {
                for (const sym of mod.symbols) {
                    const item = new vscode.CompletionItem(sym.name);
                    item.detail = sym.type;
                    if (sym.comment) {
                        item.documentation = new vscode.MarkdownString(sym.comment);
                    }
                    
                    if (sym.kind === 'port') {item.kind = vscode.CompletionItemKind.Interface;}
                    else if (sym.kind === 'parameter' || sym.kind === 'localparam') {item.kind = vscode.CompletionItemKind.Constant;}
                    else {item.kind = vscode.CompletionItemKind.Variable;}

                    pushUnique(item);
                }
            }
        }

        // 2. A3 优化: 始终融合实时符号
        //    这覆盖了：缓存存在但未更新、文件未保存、新增变量尚未触发 watcher 的场景。
        const liveSymbols = this.extractLiveSymbols(document, position, currentModules);
        for (const sym of liveSymbols) {
            pushUnique(sym);
        }

        // 3. 模块级补全：提供全局模块和快捷的例化模板 (Snippets)
        const allModules = this.projectManager.getAllModules();
        for (const mod of allModules) {
            const item = new vscode.CompletionItem(mod.name, vscode.CompletionItemKind.Class);
            item.detail = `Module (Auto Instantiate)`;
            
            // 构建带端口和参数映射的 snippet
            let snippet = `${mod.name} `;
            
            if (mod.params.length > 0) {
                snippet += `#(\n`;
                snippet += mod.params.map(p => `    .${p.name}(${p.defaultValue})`).join(',\n');
                snippet += `\n) `;
            }
            
            snippet += `u_${mod.name} (\n`;
            
            if (mod.ports.length > 0) {
                snippet += mod.ports.map((p, idx) => `    .${p.name}(\${${idx + 1}})`).join(',\n');
            }
            
            snippet += `\n);`;
            
            item.insertText = new vscode.SnippetString(snippet);
            pushUnique(item);
        }

        return completions;
    }

    /**
     * 实时解析当前文档文本，提取局部变量声明
     * 用于在 AstParser 未就绪或文件未保存时提供补全
     */
    private extractLiveSymbols(
        document: vscode.TextDocument,
        position: vscode.Position,
        currentModules: ReturnType<ProjectManager['getModulesInFile']>
    ): vscode.CompletionItem[] {
        const text = this.getScopedModuleText(document, position, currentModules);
        const items: vscode.CompletionItem[] = [];
        const seen = new Set<string>();

        // 正则匹配各种类型的信号/变量声明
        const patterns: Array<{ regex: RegExp; kind: vscode.CompletionItemKind; label: string }> = [
            // wire [7:0] signal_name;  或  wire signal_name, signal_name2;
            { regex: /\b(wire|reg|logic)\s+(?:signed\s+)?(?:\[.*?\]\s+)?(\w+)/g, kind: vscode.CompletionItemKind.Variable, label: 'signal' },
            // input/output/inout wire [7:0] port_name
            { regex: /\b(input|output|inout)\s+(?:wire|reg|logic)?\s*(?:signed\s+)?(?:\[.*?\]\s+)?(\w+)/g, kind: vscode.CompletionItemKind.Interface, label: 'port' },
            // parameter NAME = value
            { regex: /\b(parameter|localparam)\s+(?:\w+\s+)?(\w+)\s*=/g, kind: vscode.CompletionItemKind.Constant, label: 'param' },
            // integer / genvar / real
            { regex: /\b(integer|genvar|real)\s+(\w+)/g, kind: vscode.CompletionItemKind.Variable, label: 'var' },
        ];

        // Verilog 关键字黑名单，避免将类型关键字误判为变量名
        const keywords = new Set([
            'wire', 'reg', 'logic', 'input', 'output', 'inout', 'signed', 'unsigned',
            'parameter', 'localparam', 'integer', 'genvar', 'real',
            'module', 'endmodule', 'begin', 'end', 'always', 'assign', 'if', 'else',
            'case', 'endcase', 'for', 'while', 'function', 'task', 'generate'
        ]);

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.regex.exec(text)) !== null) {
                const typeName = match[1];
                const varName = match[2];
                
                // 过滤关键字和已见过的名称
                if (keywords.has(varName) || seen.has(varName)) {continue;}
                seen.add(varName);

                const item = new vscode.CompletionItem(varName, pattern.kind);
                item.detail = `${typeName} (live parse)`;
                item.sortText = `0_${varName}`; // 提高局部变量的排序优先级
                items.push(item);
            }
        }

        return items;
    }

    private getScopedModuleText(
        document: vscode.TextDocument,
        position: vscode.Position,
        currentModules: ReturnType<ProjectManager['getModulesInFile']>
    ): string {
        // 优先使用项目索引模块范围（更精确）
        for (const mod of currentModules) {
            if (mod.range.contains(position) && !mod.range.isEmpty) {
                return document.getText(mod.range);
            }
        }

        // 索引不可用时，从当前光标回溯 module，并向后寻找 endmodule
        const fullText = document.getText();
        const cursorOffset = document.offsetAt(position);
        const textBeforeCursor = fullText.slice(0, cursorOffset);
        const moduleRegex = /\bmodule\b/g;
        let lastModuleOffset = -1;
        let match: RegExpExecArray | null;

        while ((match = moduleRegex.exec(textBeforeCursor)) !== null) {
            lastModuleOffset = match.index;
        }

        if (lastModuleOffset < 0) {
            return fullText;
        }

        const textAfterModule = fullText.slice(lastModuleOffset);
        const endmoduleMatch = /\bendmodule\b/.exec(textAfterModule);
        if (!endmoduleMatch) {
            return fullText;
        }

        const scopedEnd = lastModuleOffset + endmoduleMatch.index + endmoduleMatch[0].length;
        return fullText.slice(lastModuleOffset, scopedEnd);
    }

    private getItemLabel(label: vscode.CompletionItemLabel | string): string {
        return typeof label === 'string' ? label : label.label;
    }
}
