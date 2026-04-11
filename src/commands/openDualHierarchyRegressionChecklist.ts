import * as path from 'path';

export interface OpenDualHierarchyChecklistActions {
    workspaceRoot?: string;
    existsSync: (filePath: string) => boolean;
    openChecklist: (filePath: string) => Promise<void>;
    runFallbackDebug: () => Promise<void>;
    showWarning: (message: string) => void;
}

export function getDualHierarchyChecklistPath(workspaceRoot?: string): string | undefined {
    if (!workspaceRoot) {
        return undefined;
    }

    return path.join(workspaceRoot, 'resources', 'regression', 'DUAL_HIERARCHY_MANUAL_REGRESSION.md');
}

export async function openDualHierarchyRegressionChecklist(
    actions: OpenDualHierarchyChecklistActions
): Promise<'opened' | 'fallback'> {
    const checklistPath = getDualHierarchyChecklistPath(actions.workspaceRoot);
    if (checklistPath && actions.existsSync(checklistPath)) {
        await actions.openChecklist(checklistPath);
        return 'opened';
    }

    await actions.runFallbackDebug();
    actions.showWarning('DUAL_HIERARCHY_MANUAL_REGRESSION.md not found. Opened dual hierarchy diagnostics instead.');
    return 'fallback';
}