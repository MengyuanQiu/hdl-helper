import { HdlModule, HdlPort } from '../project/hdlSymbol';

/**
 * 统一的代码生成工具
 */
export class CodeGenerator {
    /**
     * 生成模块例化代码模板
     * @param module 模块对象
     * @param withComments 是否在行尾添加 // input wire [31:0] 这样的注释 (V1.0 风格)
     */
    public static generateInstantiation(module: HdlModule, withComments: boolean = false): string {
        const name = module.name;
        const instanceName = `u_${name}`;
        
        // 1. 参数部分 (Parameters)
        let paramBlock = '';
        if (module.params && module.params.length > 0) {
            const maxLen = Math.max(...module.params.map(p => p.name.length), 0);
            const lines = module.params.map((p, i) => {
                const padding = ' '.repeat(maxLen - p.name.length);
                const end = i === module.params.length - 1 ? '' : ',';
                // 格式: .WIDTH ( 32 )
                return `    .${p.name}${padding} ( ${p.defaultValue} )${end}`;
            });
            paramBlock = ` #(\n${lines.join('\n')}\n)`;
        }

        // 2. 端口部分 (Ports)
        let portBlock = '';
        if (module.ports && module.ports.length > 0) {
            const maxLen = Math.max(...module.ports.map(p => p.name.length), 0);
            
            const lines = module.ports.map((p, i) => {
                const padding = ' '.repeat(maxLen - p.name.length);
                const end = i === module.ports.length - 1 ? '' : ',';
                
                let line = `    .${p.name}${padding} ( ${p.name}${padding} )${end}`;
                
                // V1.0 风格：添加注释 // input wire [7:0]
                if (withComments) {
                    // 对齐注释稍微美观一点
                    const commentPad = ' '.repeat(Math.max(0, 30 - line.length)); 
                    line += `${commentPad} // ${p.dir} ${p.type}`;
                }
                return line;
            });
            portBlock = ` (\n${lines.join('\n')}\n);`;
        } else {
            portBlock = ` ();`;
        }

        return `${name}${paramBlock} ${instanceName}${portBlock}`;
    }


/**
     * 🔥 新增：解析选中的例化代码，提取信号用于自动声明
     * 用于命令: Ctrl+Alt+W (Auto Signal Declaration)
     */
    public static parseSelectedInstantiation(text: string): HdlPort[] {
        const lines = text.split(/\r?\n/);
        const signals: HdlPort[] = [];
        const signalNames = new Set<string>();

        // 同时支持:
        // 1) .port(sig) // input logic [7:0]
        // 2) .port(sig)
        // 3) .port(sig[7:0]) -> 声明 sig
        // 对复杂表达式 (拼接/函数调用/运算/层级引用) 直接跳过，避免误声明。
        const connectionRegex = /\.\w+\s*\(\s*([^\)]+?)\s*\)/g;

        for (const line of lines) {
            let match: RegExpExecArray | null;
            while ((match = connectionRegex.exec(line)) !== null) {
                const expr = match[1];
                const signalName = this.extractDeclarableSignal(expr);
                if (!signalName || signalNames.has(signalName)) {
                    continue;
                }

                signalNames.add(signalName);
                signals.push({
                    name: signalName,
                    dir: 'wire',
                    type: this.extractTypeFromInlineComment(line) ?? 'logic'
                } as HdlPort);
            }
        }

        return signals;
    }

    private static extractDeclarableSignal(expr: string): string | null {
        let s = expr.trim().replace(/,\s*$/, '');
        if (!s) {
            return null;
        }

        // 常量或复杂表达式不做自动声明
        if (/^\d+$/.test(s) || /^\d+'[bBdDhHoO][0-9a-fA-F_xXzZ?]+$/.test(s) || /^'[01xXzZ]$/.test(s)) {
            return null;
        }
        if (/^\{.*\}$/.test(s) || /^[A-Za-z_]\w*\s*\(.*\)$/.test(s)) {
            return null;
        }
        if (/[?:+\-*/%&|^~<>=!]/.test(s) || s.includes('.')) {
            return null;
        }

        // 允许位选/部分位选: sig[3], sig[7:0]
        const idMatch = s.match(/^([A-Za-z_]\w*)(?:\s*\[[^[\]]+\]\s*)*$/);
        return idMatch ? idMatch[1] : null;
    }

    private static extractTypeFromInlineComment(line: string): string | undefined {
        const commentStart = line.indexOf('//');
        if (commentStart < 0) {
            return undefined;
        }

        const comment = line.slice(commentStart);
        const match = comment.match(/\b(input|output|inout)\b\s*(?:wire|reg|logic)?\s*(.*)$/);
        if (!match) {
            return undefined;
        }

        const tail = match[2].trim();
        if (!tail) {
            return 'logic';
        }

        const width = tail.match(/\[[^[\]]+\]/)?.[0];
        return width ? `logic ${width}` : 'logic';
    }

}