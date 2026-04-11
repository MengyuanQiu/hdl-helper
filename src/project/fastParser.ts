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
            
            // P9 Fix: 使用 endmodule 关键字作为模块边界，而非"下一个 module"
            const endmoduleRegex = /\bendmodule\b/g;
            endmoduleRegex.lastIndex = moduleRegex.lastIndex;
            const endmoduleMatch = endmoduleRegex.exec(cleanText);
            const endIndex = endmoduleMatch ? endmoduleMatch.index + endmoduleMatch[0].length : cleanText.length;
            
            const moduleText = cleanText.substring(startIndex, endIndex);

            const definitionRange = this.findRange(text, moduleName, startIndex); 
            const hdlModule = new HdlModule(moduleName, uri, definitionRange);

            // 优先解析模块头，避免把 signed/unsigned 等类型关键字误当端口名
            const header = this.extractHeaderInfo(moduleText, moduleName);

            for (const p of header.params) {
                hdlModule.addParam(new HdlParam(p.name, p.defaultValue));
            }
            for (const p of header.ports) {
                hdlModule.addPort(new HdlPort(p.name, p.dir, p.type));
            }

            // 非 ANSI 端口风格兜底：module m(a,b); input a; output b;
            if (hdlModule.ports.length === 0 && header.bodyText) {
                const bodyPortRegex = /\b(input|output|inout)\s+([^;]+);/g;
                let m;
                while ((m = bodyPortRegex.exec(header.bodyText)) !== null) {
                    const dir = m[1];
                    const decl = m[2];
                    const chunks = this.splitTopLevelComma(decl);
                    let inheritedType = '';

                    for (const raw of chunks) {
                        const parsed = this.parsePortChunk(raw, dir, inheritedType);
                        if (!parsed) {
                            continue;
                        }
                        inheritedType = parsed.type || inheritedType;
                        hdlModule.addPort(new HdlPort(parsed.name, parsed.dir, parsed.type));
                    }
                }
            }

            // 3. 提取实例化 (保持不变)
            const instRegex = /\b([a-zA-Z_]\w*)\s+(?:#\s*\([^;]*?\)\s*)?([a-zA-Z_]\w*)\s*\(/g;
            let match;
            while ((match = instRegex.exec(moduleText)) !== null) {
                const type = match[1];
                const name = match[2];
                if (this.reservedKeywords.has(type)) {continue;}

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

    private static extractHeaderInfo(moduleText: string, moduleName: string): {
        params: HdlParam[];
        ports: HdlPort[];
        bodyText: string;
    } {
        const params: HdlParam[] = [];
        const ports: HdlPort[] = [];

        const moduleNameRegex = new RegExp('\\bmodule\\s+' + moduleName + '\\b');
        const mm = moduleNameRegex.exec(moduleText);
        if (!mm) {
            return { params, ports, bodyText: moduleText };
        }

        let i = mm.index + mm[0].length;
        while (i < moduleText.length && /\s/.test(moduleText[i])) {
            i++;
        }

        if (moduleText[i] === '#') {
            i++;
            while (i < moduleText.length && /\s/.test(moduleText[i])) {
                i++;
            }
            if (moduleText[i] === '(') {
                const pClose = this.findMatchingParen(moduleText, i);
                if (pClose > i) {
                    const paramHeader = moduleText.slice(i + 1, pClose);
                    for (const raw of this.splitTopLevelComma(paramHeader)) {
                        const parsed = this.parseParamChunk(raw);
                        if (parsed) {
                            params.push(parsed);
                        }
                    }
                    i = pClose + 1;
                }
            }
        }

        while (i < moduleText.length && /\s/.test(moduleText[i])) {
            i++;
        }

        if (moduleText[i] === '(') {
            const lClose = this.findMatchingParen(moduleText, i);
            if (lClose > i) {
                const portHeader = moduleText.slice(i + 1, lClose);
                let currentDir = 'input';
                let currentType = '';
                let hasAnsiDir = false;

                for (const raw of this.splitTopLevelComma(portHeader)) {
                    const parsed = this.parsePortChunk(raw, currentDir, currentType);
                    if (!parsed) {
                        continue;
                    }

                    if (parsed.hasExplicitDir) {
                        hasAnsiDir = true;
                        currentDir = parsed.dir;
                        currentType = parsed.type;
                    } else if (!hasAnsiDir) {
                        // 非 ANSI 风格端口头，忽略，交给 body 兜底解析
                        continue;
                    }

                    ports.push(new HdlPort(parsed.name, parsed.dir, parsed.type));
                }

                const bodyStart = moduleText.indexOf(';', lClose);
                const bodyText = bodyStart >= 0 ? moduleText.slice(bodyStart + 1) : '';
                return { params, ports, bodyText };
            }
        }

        return { params, ports, bodyText: moduleText };
    }

    private static parseParamChunk(chunk: string): HdlParam | null {
        let s = chunk.trim();
        if (!s.startsWith('parameter')) {
            return null;
        }
        if (s.startsWith('localparam')) {
            return null;
        }

        s = s.replace(/^parameter\b/, '').trim();
        const eq = s.indexOf('=');
        if (eq < 0) {
            return null;
        }

        const left = s.slice(0, eq).trim();
        const right = s.slice(eq + 1).trim();
        const nameMatch = left.match(/([A-Za-z_]\w*)\s*(?:\[[^[\]]*\]\s*)*$/);
        if (!nameMatch) {
            return null;
        }

        return new HdlParam(nameMatch[1], right);
    }

    private static parsePortChunk(chunk: string, inheritedDir: string, inheritedType: string): {
        name: string;
        dir: string;
        type: string;
        hasExplicitDir: boolean;
    } | null {
        let s = chunk.trim();
        if (!s) {
            return null;
        }

        let dir = inheritedDir;
        let type = inheritedType;
        let hasExplicitDir = false;

        const dirMatch = s.match(/^(input|output|inout)\b/);
        if (dirMatch) {
            hasExplicitDir = true;
            dir = dirMatch[1];
            s = s.slice(dirMatch[0].length).trim();
        }

        const nameMatch = s.match(/([A-Za-z_]\w*)\s*(?:\[[^[\]]*\]\s*)*$/);
        if (!nameMatch) {
            return null;
        }

        const name = nameMatch[1];
        if (['signed', 'unsigned', 'logic', 'wire', 'reg'].includes(name)) {
            return null;
        }

        const typeText = s.slice(0, nameMatch.index).trim();
        if (typeText) {
            type = typeText;
        }

        return { name, dir, type, hasExplicitDir };
    }

    private static findMatchingParen(text: string, openIndex: number): number {
        let depth = 0;
        for (let i = openIndex; i < text.length; i++) {
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

    private static splitTopLevelComma(text: string): string[] {
        const out: string[] = [];
        let start = 0;
        let p = 0;
        let b = 0;
        let c = 0;

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (ch === '(') {
                p++;
            } else if (ch === ')') {
                p--;
            } else if (ch === '[') {
                b++;
            } else if (ch === ']') {
                b--;
            } else if (ch === '{') {
                c++;
            } else if (ch === '}') {
                c--;
            } else if (ch === ',' && p === 0 && b === 0 && c === 0) {
                out.push(text.slice(start, i));
                start = i + 1;
            }
        }

        out.push(text.slice(start));
        return out;
    }

    /**
     * 辅助函数：根据索引位置计算 VS Code 的 Range (行号)
     * 这里简化处理：直接查找字符串在原文本中的位置
     */
    private static findRange(fullText: string, target: string, startSearchIndex: number): vscode.Range {
        const index = fullText.indexOf(target, startSearchIndex);
        if (index === -1) {return new vscode.Range(0, 0, 0, 0);}
        const lines = fullText.substring(0, index).split('\n');
        const line = lines.length - 1;
        const char = lines[lines.length - 1].length;
        return new vscode.Range(line, char, line, char + target.length);
    }
}