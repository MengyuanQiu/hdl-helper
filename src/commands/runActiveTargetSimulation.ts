import * as vscode from 'vscode';
import { ProjectConfigService } from '../project/projectConfigService';
import { StateService } from '../project/stateService';
import { TargetContextService } from '../project/targetContextService';

export function resolveFallbackSimulationTop(designTop?: string, simulationTop?: string): string | undefined {
    return simulationTop || designTop;
}

export function buildConfigFallbackWarning(activeTargetId?: string): string {
    if (activeTargetId) {
        return `Active target '${activeTargetId}' has no resolved top. Falling back to heuristic top.`;
    }

    return 'Unable to resolve active target context from project config. Falling back to heuristic top.';
}

export async function runActiveTargetSimulation(stateService: StateService): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showWarningMessage('No workspace folder open.');
        return;
    }

    let resolvedTop: string | undefined;
    let fallbackWarning: string | undefined;

    const configEnabled = vscode.workspace
        .getConfiguration('hdl-helper', workspaceFolder.uri)
        .get<boolean>('projectConfig.enabled', false);

    if (configEnabled) {
        const configService = new ProjectConfigService(workspaceFolder.uri.fsPath);
        const projectConfig = await configService.loadConfig();
        const targetContextService = new TargetContextService(workspaceFolder.uri.fsPath, {
            projectConfig,
            designTop: stateService.getDesignTop(),
            simulationTop: stateService.getSimulationTop()
        });

        const activeContext = targetContextService.getActiveTargetContext();
        resolvedTop = activeContext?.top;
        if (!resolvedTop) {
            fallbackWarning = buildConfigFallbackWarning(activeContext?.targetId);
        }

        configService.dispose();
    }

    if (!resolvedTop) {
        resolvedTop = resolveFallbackSimulationTop(
            stateService.getDesignTop(),
            stateService.getSimulationTop()
        );

        if (resolvedTop && fallbackWarning) {
            vscode.window.showWarningMessage(fallbackWarning);
        }
    }

    if (!resolvedTop) {
        vscode.window.showWarningMessage('Cannot resolve top for active target simulation. Set Simulation Top or configure active target top in project.json.');
        return;
    }

    await vscode.commands.executeCommand('hdl-helper.runSimulation', resolvedTop);
}
