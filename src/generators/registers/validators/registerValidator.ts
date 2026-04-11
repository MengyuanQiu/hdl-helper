import { RegisterMap } from '../registerTypes';

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

export class RegisterValidator {
    public static validate(map: RegisterMap): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        if (!map.moduleName) {errors.push('RegisterMap must have a moduleName.');}
        if (!map.dataWidth || (map.dataWidth % 8 !== 0)) {errors.push('dataWidth must be a multiple of 8 (e.g., 32, 64).');}

        const offsetSet = new Set<number>();

        for (const reg of map.registers) {
            if (offsetSet.has(reg.offset)) {
                errors.push(`Duplicate register offset: 0x${reg.offset.toString(16)} in register ${reg.name}`);
            }
            offsetSet.add(reg.offset);

            if (reg.offset % (map.dataWidth / 8) !== 0) {
                warnings.push(`Register ${reg.name} offset 0x${reg.offset.toString(16)} is not aligned to data width ${map.dataWidth}`);
            }

            let totalBits = 0;
            const bitSet = new Set<number>();
            for (const field of reg.fields) {
                totalBits += field.bitWidth;
                
                // check out of bounds
                if (field.bitOffset + field.bitWidth > map.dataWidth) {
                    errors.push(`Field ${field.name} in register ${reg.name} exceeds data width ${map.dataWidth}`);
                }

                // check overlaps
                for (let i = 0; i < field.bitWidth; i++) {
                    const b = field.bitOffset + i;
                    if (bitSet.has(b)) {
                        errors.push(`Bit overlap detected at bit ${b} in register ${reg.name}`);
                    }
                    bitSet.add(b);
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }
}
