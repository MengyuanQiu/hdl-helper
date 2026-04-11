import * as fs from 'fs';
import * as path from 'path';
import { RegisterMap, RegisterDef, RegisterField } from '../registerTypes';

export class CsvRegisterParser {
    public static parse(filePath: string): RegisterMap {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
        
        if (lines.length === 0) {throw new Error("CSV file is empty");}

        const map: RegisterMap = {
            moduleName: path.basename(filePath, path.extname(filePath)),
            dataWidth: 32, // Default
            registers: []
        };

        // Assume columns: RegName, Offset, FieldName, BitOffset, BitWidth, Access, ResetValue, Description
        const header = lines[0].toLowerCase();
        // Skip header check for brevity, assuming standard format

        let currentRegName = '';
        let currentReg: RegisterDef | undefined;

        for (let i = 1; i < lines.length; i++) {
            const rawLine = lines[i];
            // Handle quotes in CSV naive split
            const cols = rawLine.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
            
            if (cols.length < 6) {continue;}

            const regName = cols[0];
            const offsetStr = cols[1];
            const fieldName = cols[2];
            const bitOffset = parseInt(cols[3]);
            const bitWidth = parseInt(cols[4]);
            const access = cols[5].toLowerCase() as any;
            const resetVal = cols[6] ? parseInt(cols[6], 16) : 0;
            const desc = cols[7] || '';

            if (regName && regName !== currentRegName) {
                currentRegName = regName;
                currentReg = {
                    name: regName,
                    offset: parseInt(offsetStr, 16),
                    fields: []
                };
                map.registers.push(currentReg);
            }

            if (currentReg && fieldName) {
                currentReg.fields.push({
                    name: fieldName,
                    bitOffset: isNaN(bitOffset) ? 0 : bitOffset,
                    bitWidth: isNaN(bitWidth) ? 32 : bitWidth,
                    access,
                    resetValue: isNaN(resetVal) ? 0 : resetVal,
                    description: desc
                });
            }
        }

        return map;
    }
}
