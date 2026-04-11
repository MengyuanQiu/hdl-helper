import * as fs from 'fs';
import * as vscode from 'vscode';
import { StateService } from '../project/stateService';
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
    const entries = getRecentRunEntries(stateService.getAllRunRecords());
    if (entries.length === 0) {
        vscode.window.showWarningMessage('No recent run records found for current workspace.');
        return;
    }

    const picked = await vscode.window.showQuickPick(
        entries.map(entry => ({
            label: entry.targetId,
            description: entry.record.success ? 'success' : 'failed',
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