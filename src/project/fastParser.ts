import * as vscode from 'vscode';
import { HdlModule, HdlInstance, HdlModuleType, HdlPort, HdlParam } from './hdlSymbol';

/**
 * FastParser: 基于正则的轻量级解析器
 * 目标：以最快速度提取模块名和实例化关系，不进行全语法检查
 */
export class FastParser {
    // 常见的 Verilog 关键字，用于过滤误判 (比如把 always 当成模块实例化)
    private static reservedKeywords = new Set([
        'always', 'always_ff', 'always_comb', 'always_latch', 'assign',
        'initial', 'if', 'else', 'case', 'default', 'endcase', 'begin', 'end',
        'generate', 'endgenerate', 'function', 'task', 'class', 'covergroup',
        'assert', 'property', 'sequence', 'logic', 'wire', 'reg', 'input', 'output', 'inout',
        // 👇 新增这些防误判
        'module', 'endmodule', 'interface', 'endinterface', 'package', 'endpackage', 
        'program', 'endprogram', 'ifdef', 'endif', 'elsif', 'define', 'include',
        'iff', 'disable', 'config', 'library', 'design', 'property', 'sequence'
    ]);

    /**
     * 解析单个文件的内容
     * @param document VS Code 文档对象 (或者只是提供 text 和 uri)
     */
    public static parse(text: string, uri: vscode.Uri): HdlModule[] {
        const cleanText = this.removeComments(text);
        const modules: HdlModule[] = [];

        // 1. 提取模块定义
        const moduleRegex = /\bmodule\s+(\w+)/g;
        let moduleMatch;
        while ((moduleMatch = moduleRegex.exec(cleanText)) !== null) {
            const moduleName = moduleMatch[1];
            const startIndex = moduleMatch.index;
            
            // 找到下一个 module 或者 EOF，限定当前模块的作用域
            const nextModuleMatch = /\bmodule\s+\w+/.exec(cleanText.substring(moduleRegex.lastIndex));
            const endIndex = nextModuleMatch ? moduleRegex.lastIndex + nextModuleMatch.index : cleanText.length;
            
            const moduleText = cleanText.substring(startIndex, endIndex);

            const definitionRange = this.findRange(text, moduleName, startIndex); 
            const hdlModule = new HdlModule(moduleName, uri, definitionRange);

            // --- 🔥 核心正则升级 🔥 ---
            // 目标：同时捕获 参数块(Group 1) 和 端口块(Group 2)
            // 结构: module name #( ...params... ) ( ...ports... );
            const headerRegex = /\bmodule\s+\w+\s*(?:#\s*\(([\s\S]*?)\))?\s*\(([\s\S]*?)\)\s*;/;
            const headerMatch = headerRegex.exec(moduleText);
            
            if (headerMatch) {
                // ---> A. 处理参数 (Group 1)
                const paramBlock = headerMatch[1]; 
                if (paramBlock) {
                    const paramRegex = /\bparameter\s+(?:\w+\s+)?(\w+)\s*=\s*([^,)]+)/g;
                    let m;
                    while ((m = paramRegex.exec(paramBlock)) !== null) {
                        const name = m[1];
                        const val = m[2].trim();
                        hdlModule.addParam(new HdlParam(name, val));
                    }
                }

                // ---> B. 处理端口 (Group 2)
                const portsBlock = headerMatch[2];
                if (portsBlock) {
                    const portRegex = /\b(input|output|inout)\s+(?:(wire|reg|logic)\s+)?(?:(\[.*?\])\s+)?(\w+)/g;
                    let m;
                    while ((m = portRegex.exec(portsBlock)) !== null) {
                        const dir = m[1];
                        const type = (m[2] || '') + (m[3] ? ' ' + m[3] : '');
                        const name = m[4];
                        hdlModule.addPort(new HdlPort(name, dir, type.trim()));
                    }
                }
            }

            // 3. 提取实例化 (保持不变)
            const instRegex = /\b([a-zA-Z_]\w*)\s+(?:#\s*\([^;]*?\)\s*)?([a-zA-Z_]\w*)\s*\(/g;
            let match;
            while ((match = instRegex.exec(moduleText)) !== null) {
                const type = match[1];
                const name = match[2];
                if (this.reservedKeywords.has(type)) continue;

                // 计算实例化在原文件中的真实位置
                const range = this.findRange(text, name, startIndex + match.index);
                hdlModule.addInstance(new HdlInstance(type, name, range, uri));
            }

            modules.push(hdlModule);
        }

        return modules;
    }

    /**
     * 去除代码中的 C 风格和 C++ 风格注释
     */
    private static removeComments(text: string): string {
        return text.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
    }

    /**
     * 辅助函数：根据索引位置计算 VS Code 的 Range (行号)
     * 这里简化处理：直接查找字符串在原文本中的位置
     */
    private static findRange(fullText: string, target: string, startSearchIndex: number): vscode.Range {
        const index = fullText.indexOf(target, startSearchIndex);
        if (index === -1) return new vscode.Range(0, 0, 0, 0);
        const lines = fullText.substring(0, index).split('\n');
        const line = lines.length - 1;
        const char = lines[lines.length - 1].length;
        return new vscode.Range(line, char, line, char + target.length);
    }
}