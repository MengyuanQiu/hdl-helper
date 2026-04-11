import { RegisterMap } from '../registerTypes';

export function emitMarkdown(map: RegisterMap): string {
    const lines: string[] = [];
    
    lines.push(`# ${map.moduleName} Register Map\n`);
    lines.push(`- **Data Width**: ${map.dataWidth} bits`);
    lines.push(`- **Total Registers**: ${map.registers.length}\n`);

    lines.push(`## Register Summary\n`);
    lines.push(`| Offset | Name | Description |`);
    lines.push(`| ------ | ---- | ----------- |`);
    map.registers.forEach(reg => {
        lines.push(`| \`0x${reg.offset.toString(16)}\` | **${reg.name}** | ${reg.description || ''} |`);
    });

    lines.push(`\n## Detailed Fields\n`);
    map.registers.forEach(reg => {
        lines.push(`### 0x${reg.offset.toString(16)}: ${reg.name}`);
        if(reg.description) {lines.push(`> ${reg.description}\n`);}
        
        lines.push(`| Bits | Name | Access | Reset | Description |`);
        lines.push(`| ---- | ---- | ------ | ----- | ----------- |`);
        reg.fields.forEach(f => {
            const bits = f.bitWidth > 1 ? `[${f.bitOffset + f.bitWidth - 1}:${f.bitOffset}]` : `[${f.bitOffset}]`;
            lines.push(`| ${bits} | ${f.name} | ${f.access.toUpperCase()} | \`${f.resetValue || 0}\` | ${f.description || ''} |`);
        });
        lines.push(``);
    });

    return lines.join('\n');
}
