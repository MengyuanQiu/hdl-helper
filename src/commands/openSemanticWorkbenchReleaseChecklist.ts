import * as path from 'path';

export interface OpenSemanticWorkbenchChecklistActions {
    workspaceRoot?: string;
    existsSync: (filePath: string) => boolean;
    openChecklist: (filePath: string) => Promise<void>;
    runFallbackGuide: () => Promise<void>;
    showWarning: (message: string) => void;
}

export function getSemanticWorkbenchChecklistPath(workspaceRoot?: string): string | undefined {
    if (!workspaceRoot) {
        return undefined;
    }

    return path.join(workspaceRoot, 'resources', 'regression', 'SEMANTIC_WORKBENCH_RELEASE_CHECKLIST.md');
}

export async function openSemanticWorkbenchReleaseChecklist(
    actions: OpenSemanticWorkbenchChecklistActions
): Promise<'opened' | 'fallback'> {
    const checklistPath = getSemanticWorkbenchChecklistPath(actions.workspaceRoot);
    if (checklistPath && actions.existsSync(checklistPath)) {
        await actions.openChecklist(checklistPath);
        return 'opened';
    }

    await actions.runFallbackGuide();
    actions.showWarning('SEMANTIC_WORKBENCH_RELEASE_CHECKLIST.md not found. Opened Workbench settings guide instead.');
    return 'fallback';
}
