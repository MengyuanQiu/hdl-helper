import * as fs from 'fs';
import * as vscode from 'vscode';
import { ProjectConfigService } from '../project/projectConfigService';
import { StateService } from '../project/stateService';
import { TargetContextService } from '../project/targetContextService';
import { RunRecord } from '../project/types';
import { pickRunRecordForTarget } from './openLastWaveformByTarget';

export function getLogPathFromRunRecord(record: RunRecord | undefined): string | undefined {
    return record?.logPath;
}

export async function openLastLogByTarget(stateService: StateService): Promise<void> {
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
    const logPath = getLogPathFromRunRecord(record);

    if (!logPath || !fs.existsSync(logPath)) {
        vscode.window.showWarningMessage('No log path found in last run record for active target.');
        return;
    }

    await vscode.window.showTextDocument(vscode.Uri.file(logPath), { preview: false });
}