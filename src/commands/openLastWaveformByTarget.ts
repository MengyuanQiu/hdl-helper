import * as fs from 'fs';
import * as vscode from 'vscode';
import { ProjectConfigService } from '../project/projectConfigService';
import { StateService } from '../project/stateService';
import { TargetContextService } from '../project/targetContextService';
import { RunRecord } from '../project/types';

export function pickRunRecordForTarget(
    records: Record<string, RunRecord>,
    targetId: string | undefined
): RunRecord | undefined {
    if (!targetId) {
        return undefined;
    }

    return records[targetId];
}

export async function openLastWaveformByTarget(stateService: StateService): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showWarningMessage('No workspace folder open.');
        return;
    }

    const records = stateService.getAllRunRecords();
    if (Object.keys(records).length === 0) {
        vscode.window.showWarningMessage('No recent run records found for current workspace.');
        return;
    }

    let targetId: string | undefined;
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
        targetId = targetContextService.getActiveTargetContext()?.targetId;
        configService.dispose();
    }

    if (!targetId) {
        const simTop = stateService.getSimulationTop();
        const designTop = stateService.getDesignTop();
        if (simTop && records[`heuristic:${simTop}`]) {
            targetId = `heuristic:${simTop}`;
        } else if (designTop && records[`heuristic:${designTop}`]) {
            targetId = `heuristic:${designTop}`;
        }
    }

    const record = pickRunRecordForTarget(records, targetId);
    if (!record) {
        vscode.window.showWarningMessage('No run record matched the current active target context.');
        return;
    }

    if (!record.waveformPath || !fs.existsSync(record.waveformPath)) {
        vscode.window.showWarningMessage('No waveform path found in last run record for active target.');
        return;
    }

    await vscode.commands.executeCommand('hdl-helper.viewWaveform', record.waveformPath);
}