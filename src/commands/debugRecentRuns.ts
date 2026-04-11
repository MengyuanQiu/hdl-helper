import * as vscode from 'vscode';
import { StateService } from '../project/stateService';
import { RunRecord } from '../project/types';

export function formatRunRecords(records: Record<string, RunRecord>): string[] {
    const targetIds = Object.keys(records).sort((a, b) => a.localeCompare(b));
    if (targetIds.length === 0) {
        return ['No run records available.'];
    }

    const lines: string[] = [];
    for (const targetId of targetIds) {
        const record = records[targetId];
        lines.push(`Target: ${targetId}`);
        lines.push(`  Success: ${record.success}`);
        lines.push(`  Timestamp: ${new Date(record.timestamp).toISOString()}`);
        lines.push(`  Task: ${record.taskName || 'n/a'}`);
        lines.push(`  BuildDir: ${record.buildDir || 'n/a'}`);
        lines.push(`  Waveform: ${record.waveformPath || 'n/a'}`);
        lines.push(`  Log: ${record.logPath || 'n/a'}`);
    }

    return lines;
}

export async function debugRecentRunsByTarget(
    stateService: StateService,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    const records = stateService.getAllRunRecords();
    const lines = formatRunRecords(records);

    outputChannel.clear();
    outputChannel.show(true);
    outputChannel.appendLine('='.repeat(80));
    outputChannel.appendLine('HDL Helper - Recent Runs By Target');
    outputChannel.appendLine('='.repeat(80));
    outputChannel.appendLine('');
    lines.forEach(line => outputChannel.appendLine(line));
    outputChannel.appendLine('');
    outputChannel.appendLine('='.repeat(80));
    outputChannel.appendLine('Recent runs debug complete');
    outputChannel.appendLine('='.repeat(80));
}