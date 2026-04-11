import * as vscode from 'vscode';
import { HdlTreeProvider } from '../project/hdlTreeProvider';
import { StateService } from '../project/stateService';

function labelOf(provider: HdlTreeProvider, item: unknown): string {
    const label = provider.getTreeItem(item as any).label;
    return typeof label === 'string' ? label : String(label);
}

export async function debugDualHierarchyState(
    treeProvider: HdlTreeProvider,
    stateService: StateService,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    const config = vscode.workspace.getConfiguration('hdl-helper');
    const roleGroupedSources = config.get<boolean>('workbench.roleGroupedSources', false);
    const dualHierarchy = config.get<boolean>('workbench.dualHierarchy', false);
    const showLegacy = config.get<boolean>('workbench.sources.showLegacyHierarchy', true);

    outputChannel.clear();
    outputChannel.appendLine('================================================================================');
    outputChannel.appendLine('HDL Helper - Dual Hierarchy State Debug');
    outputChannel.appendLine('================================================================================');
    outputChannel.appendLine('');
    outputChannel.appendLine(`[Flags] roleGroupedSources=${roleGroupedSources}, dualHierarchy=${dualHierarchy}, showLegacy=${showLegacy}`);
    outputChannel.appendLine(`[State] designTop=${stateService.getDesignTop() ?? '(unset)'}`);
    outputChannel.appendLine(`[State] simulationTop=${stateService.getSimulationTop() ?? '(unset)'}`);
    outputChannel.appendLine('');

    const roots = await treeProvider.getChildren();
    outputChannel.appendLine(`[Tree] Root Count: ${roots.length}`);
    for (const root of roots) {
        const rootLabel = labelOf(treeProvider, root);
        outputChannel.appendLine(`- ${rootLabel}`);

        if (rootLabel === 'Design Hierarchy' || rootLabel === 'Simulation Hierarchy') {
            const children = await treeProvider.getChildren(root as any);
            if (children.length === 0) {
                outputChannel.appendLine('  - (empty)');
                continue;
            }

            for (const child of children) {
                outputChannel.appendLine(`  - ${labelOf(treeProvider, child)}`);
            }
        }
    }

    outputChannel.appendLine('');
    outputChannel.appendLine('Hint: Toggle hdl-helper.workbench.dualHierarchy and rerun this command to compare roots.');
    outputChannel.show(true);
}