import { HdlModule } from './hdlSymbol';

/**
 * Minimal hierarchy semantic service for Iteration 2.
 *
 * The service provides top inference and hierarchy root selection,
 * keeping tree-provider focused on rendering.
 */
export class HierarchyService {
    public isLikelyTestbench(module: HdlModule): boolean {
        return module.ports.length === 0 || module.name.toLowerCase().startsWith('tb');
    }

    public inferSimulationTop(modules: HdlModule[]): string | undefined {
        const testbenchModules = modules.filter(module => this.isLikelyTestbench(module));
        if (testbenchModules.length === 0) {
            return undefined;
        }

        const topCandidate = this.findHierarchyRoot(testbenchModules);
        return topCandidate?.name ?? testbenchModules[0].name;
    }

    public inferDesignTop(modules: HdlModule[]): string | undefined {
        const designCandidates = modules.filter(module => !this.isLikelyTestbench(module));
        if (designCandidates.length === 0) {
            return undefined;
        }

        const topCandidate = this.findHierarchyRoot(designCandidates);
        return topCandidate?.name ?? designCandidates[0].name;
    }

    public findHierarchyRoot(modules: HdlModule[]): HdlModule | undefined {
        const names = new Set(modules.map(module => module.name));
        const instantiated = new Set<string>();

        for (const module of modules) {
            for (const instance of module.instances) {
                if (names.has(instance.type)) {
                    instantiated.add(instance.type);
                }
            }
        }

        const rootCandidates = modules.filter(module => !instantiated.has(module.name));
        if (rootCandidates.length === 0) {
            return modules[0];
        }

        rootCandidates.sort((a, b) => b.instances.length - a.instances.length);
        return rootCandidates[0];
    }
}