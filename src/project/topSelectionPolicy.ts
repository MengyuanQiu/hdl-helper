import { HdlModule } from './hdlSymbol';
import { HierarchyService } from './hierarchyService';

export interface LegacyTopSelection {
    designTop?: string;
    simulationTop?: string;
}

/**
 * Maps legacy "Set as Top Module" intent to dual-hierarchy targets.
 */
export function mapLegacyTopSelection(
    module: HdlModule,
    hierarchyService = new HierarchyService()
): LegacyTopSelection {
    if (hierarchyService.isLikelyTestbench(module)) {
        return { simulationTop: module.name };
    }

    return { designTop: module.name };
}