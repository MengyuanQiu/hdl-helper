import { HdlModule } from '../project/hdlSymbol';
import { CodeGenerator } from './codeGenerator'; // 👈 引入这个，实现联动
import * as path from 'path';

export class DocGenerator {
    
    public static generateMarkdown(module: HdlModule): string {
        const title = `# Module: ${module.name}`;
        // 使用 ISO 格式日期，看着专业点
        const dateStr = new Date().toISOString().split('T')[0];
        const fileInfo = `**File:** \`${path.basename(module.fileUri.fsPath)}\`  \n**Date:** ${dateStr}`;
        
        let md = `${title}\n\n${fileInfo}\n\n`;

        // --- 1. Parameters Table ---
        if (module.params.length > 0) {
            md += `## ⚙️ Parameters\n\n`;
            md += `| Name | Default Value | Description |\n`;
            md += `| :--- | :--- | :--- |\n`;
            module.params.forEach(p => {
                md += `| \`${p.name}\` | \`${p.defaultValue}\` | - |\n`;
            });
            md += `\n`;
        }

        // --- 2. Interface (Ports) Table ---
        if (module.ports.length > 0) {
            md += `## 🔌 Interface\n\n`;
            md += `| Port Name | Direction | Type | Description |\n`;
            md += `| :--- | :--- | :--- | :--- |\n`;
            
            // 排序逻辑：时钟复位置顶 -> 输入 -> 输出 -> 双向
            const sortedPorts = [...module.ports].sort((a, b) => {
                const isClkRst = (name: string) => /clk|rst|clock|reset/i.test(name);
                if (isClkRst(a.name) && !isClkRst(b.name)) {return -1;}
                if (!isClkRst(a.name) && isClkRst(b.name)) {return 1;}

                const dirOrder: {[key:string]: number} = { 'input': 1, 'output': 2, 'inout': 3 };
                const scoreA = dirOrder[a.dir] || 4;
                const scoreB = dirOrder[b.dir] || 4;
                return scoreA - scoreB;
            });

            sortedPorts.forEach(p => {
                // p.type 可能是 "wire [31:0]" 或 "logic"，直接显示即可
                md += `| **${p.name}** | ${p.dir} | \`${p.type}\` | - |\n`;
            });
            md += `\n`;
        } else {
            md += `*(No ports detected)*\n\n`;
        }

        // --- 3. Example Instantiation ---
        md += `## 📋 Example Instantiation\n\n`;
        md += `\`\`\`verilog\n`;
        // 直接调用之前写好的生成器，生成不带注释的清爽版本
        md += CodeGenerator.generateInstantiation(module, false); 
        md += `\n\`\`\`\n`;

        return md;
    }
}