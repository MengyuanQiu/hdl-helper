import * as fs from 'fs';
import * as vscode from 'vscode';
import { StateService } from '../project/stateService';
import { RunRecord } from '../project/types';
import { getAvailableArtifactActions, getMissingArtifactReasons } from './openLastRunArtifactsByTarget';

export function pickRunRecordByTarget(
    records: Record<string, RunRecord>,
    targetId: string
): RunRecord | undefined {
    return records[targetId];
}

export async function openRunRecordArtifacts(
    stateService: StateService,
    targetId: string
): Promise<void> {
    const record = pickRunRecordByTarget(stateService.getAllRunRecords(), targetId);
    const actions = getAvailableArtifactActions(record);
    if (actions.length === 0) {
        vscode.window.showWarningMessage(getMissingArtifactReasons(record).join(' '));
        return;
    }

    let pickedAction: 'Open Waveform' | 'Open Log' | undefined;
    if (actions.length === 1) {
        pickedAction = actions[0];
    } else {
        pickedAction = await vscode.window.showQuickPick(actions, {
            placeHolder: `Select artifact to open (${targetId})`
        }) as 'Open Waveform' | 'Open Log' | undefined;
    }

    if (!pickedAction) {
        return;
    }

    if (pickedAction === 'Open Waveform' && record?.waveformPath && fs.existsSync(record.waveformPath)) {
        await vscode.commands.executeCommand('hdl-helper.viewWaveform', record.waveformPath);
        return;
    }

    if (pickedAction === 'Open Log' && record?.logPath && fs.existsSync(record.logPath)) {
        await vscode.window.showTextDocument(vscode.Uri.file(record.logPath), { preview: false });
    }
}