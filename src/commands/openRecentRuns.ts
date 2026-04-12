import * as fs from 'fs';
import * as vscode from 'vscode';
import { ProjectConfigService } from '../project/projectConfigService';
import { StateService } from '../project/stateService';
import { TargetContextService } from '../project/targetContextService';
import { RunRecord } from '../project/types';

export interface RecentRunEntry {
    targetId: string;
    record: RunRecord;
}

export function getRecentRunEntries(records: Record<string, RunRecord>): RecentRunEntry[] {
    return Object.entries(records)
        .map(([targetId, record]) => ({ targetId, record }))
        .sort((a, b) => b.record.timestamp - a.record.timestamp);
}

export function prioritizeActiveTarget(entries: RecentRunEntry[], activeTargetId: string | undefined): RecentRunEntry[] {
    if (!activeTargetId) {
        return entries;
    }

    const active = entries.find(entry => entry.targetId === activeTargetId);
    if (!active) {
        return entries;
    }

    return [active, ...entries.filter(entry => entry.targetId !== activeTargetId)];
}

export function getRecentRunActions(record: RunRecord): string[] {
    const actions: string[] = [];
    if (record.waveformPath) {
        actions.push('Open Waveform');
    }
    if (record.logPath) {
        actions.push('Open Log');
    }
    return actions;
}

export async function openRecentRuns(stateService: StateService): Promise<void> {
    const records = stateService.getAllRunRecords();
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const activeTargetId = await resolveActiveTargetIdForRuns(stateService, records, workspaceFolder);
    const entries = prioritizeActiveTarget(getRecentRunEntries(records), activeTargetId);
    if (entries.length === 0) {
        vscode.window.showWarningMessage('No recent run records found for current workspace.');
        return;
    }

    const picked = await vscode.window.showQuickPick(
        entries.map(entry => ({
            label: entry.targetId === activeTargetId ? `[ACTIVE] ${entry.targetId}` : entry.targetId,
            description: entry.record.success
                ? 'success'
                : `failed (${entry.record.failureType || 'unknown'})`,
            detail: `${entry.record.taskName || 'n/a'} | ${new Date(entry.record.timestamp).toLocaleString()}`,
            entry
        })),
        {
            placeHolder: 'Select a recent run record'
        }
    );

    if (!picked) {
        return;
    }

    const actions = getRecentRunActions(picked.entry.record);
    if (actions.length === 0) {
        vscode.window.showWarningMessage('Selected run record has no waveform or log path.');
        return;
    }

    const action = await vscode.window.showQuickPick(actions, {
        placeHolder: `Run target: ${picked.entry.targetId}`
    });

    if (!action) {
        return;
    }

    if (action === 'Open Waveform') {
        const waveformPath = picked.entry.record.waveformPath;
        if (!waveformPath || !fs.existsSync(waveformPath)) {
            vscode.window.showWarningMessage('Waveform file not found for selected run record.');
            return;
        }
        await vscode.commands.executeCommand('hdl-helper.viewWaveform', waveformPath);
        return;
    }

    if (action === 'Open Log') {
        const logPath = picked.entry.record.logPath;
        if (!logPath || !fs.existsSync(logPath)) {
            vscode.window.showWarningMessage('Log file not found for selected run record.');
            return;
        }
        await vscode.window.showTextDocument(vscode.Uri.file(logPath), { preview: false });
    }
}

export async function resolveActiveTargetIdForRuns(
    stateService: StateService,
    records: Record<string, RunRecord>,
    workspaceFolder: vscode.WorkspaceFolder | undefined
): Promise<string | undefined> {
    if (!workspaceFolder) {
        return undefined;
    }

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
        const targetId = targetContextService.getActiveTargetContext()?.targetId;
        configService.dispose();
        if (targetId) {
            return targetId;
        }
    }

    const simTop = stateService.getSimulationTop();
    const designTop = stateService.getDesignTop();
    if (simTop && records[`heuristic:${simTop}`]) {
        return `heuristic:${simTop}`;
    }
    if (designTop && records[`heuristic:${designTop}`]) {
        return `heuristic:${designTop}`;
    }

    return undefined;
}