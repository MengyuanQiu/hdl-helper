/**
 * Debug command for project classification.
 * 
 * Outputs classification results for all HDL files in workspace.
 * Useful for debugging classification rules and source of truth.
 * 
 * @module commands/debugProjectClassification
 */

import * as vscode from 'vscode';
import { ClassificationService } from '../project/classificationService';
import { ProjectConfigService } from '../project/projectConfigService';
import { FileClassificationResult, Role, PhysicalFileType, SourceOfTruth } from '../project/types';

export interface ClassificationObservabilityStats {
    totalFiles: number;
    sharedFiles: number;
    activeTargetFiles: number;
    sourceSetCoverage: Record<string, number>;
}

export function buildClassificationObservabilityStats(
    results: FileClassificationResult[]
): ClassificationObservabilityStats {
    const sourceSetCoverage: Record<string, number> = {};

    for (const result of results) {
        for (const sourceSetName of result.referencedBySourceSets || []) {
            sourceSetCoverage[sourceSetName] = (sourceSetCoverage[sourceSetName] || 0) + 1;
        }
    }

    return {
        totalFiles: results.length,
        sharedFiles: results.filter(result => result.roleSecondary.length > 0).length,
        activeTargetFiles: results.filter(result => result.inActiveTarget).length,
        sourceSetCoverage
    };
}

/**
 * Debug project classification command.
 * Shows classification results in output channel.
 */
export async function debugProjectClassification(
    outputChannel: vscode.OutputChannel
): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('No workspace folder open');
        return;
    }

    outputChannel.clear();
    outputChannel.show(true);
    outputChannel.appendLine('='.repeat(80));
    outputChannel.appendLine('HDL Helper - Project Classification Debug');
    outputChannel.appendLine('='.repeat(80));
    outputChannel.appendLine('');

    for (const folder of workspaceFolders) {
        await debugWorkspaceFolder(folder, outputChannel);
    }

    outputChannel.appendLine('');
    outputChannel.appendLine('='.repeat(80));
    outputChannel.appendLine('Classification debug complete');
    outputChannel.appendLine('='.repeat(80));
}

async function debugWorkspaceFolder(
    folder: vscode.WorkspaceFolder,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    const workspaceRoot = folder.uri.fsPath;
    
    outputChannel.appendLine(`Workspace: ${folder.name}`);
    outputChannel.appendLine(`Root: ${workspaceRoot}`);
    outputChannel.appendLine('');

    // Load project config if exists
    const configService = new ProjectConfigService(workspaceRoot);
    const config = await configService.loadConfig();
    const configStatus = configService.getStatus();

    outputChannel.appendLine(`Project Config Status: ${configStatus}`);
    if (config) {
        outputChannel.appendLine(`  Name: ${config.name}`);
        outputChannel.appendLine(`  Version: ${config.version}`);
        outputChannel.appendLine(`  Source Sets: ${Object.keys(config.sourceSets).length}`);
        outputChannel.appendLine(`  Targets: ${Object.keys(config.targets).length}`);
        outputChannel.appendLine(`  Active Target: ${config.activeTarget || 'none'}`);
    }
    outputChannel.appendLine('');

    // Find all HDL files
    const hdlFiles = await findHdlFiles(folder);
    outputChannel.appendLine(`Found ${hdlFiles.length} HDL files`);
    outputChannel.appendLine('');

    // Classify files
    const classificationService = new ClassificationService({
        workspaceRoot,
        projectConfig: config,
        activeTarget: config?.activeTarget
    });

    const results = await classificationService.classifyWorkspace(hdlFiles);

    // Group by role
    const byRole = groupByRole(results);
    const stats = buildClassificationObservabilityStats(results);

    // Output summary
    outputChannel.appendLine('Classification Summary:');
    outputChannel.appendLine('-'.repeat(80));
    for (const [role, files] of Object.entries(byRole)) {
        outputChannel.appendLine(`  ${role}: ${files.length} files`);
    }
    outputChannel.appendLine(`  shared files: ${stats.sharedFiles}`);
    outputChannel.appendLine(`  active target files: ${stats.activeTargetFiles}`);
    outputChannel.appendLine('');
    outputChannel.appendLine('SourceSet Coverage:');
    const sourceSetNames = Object.keys(stats.sourceSetCoverage).sort((a, b) => a.localeCompare(b));
    if (sourceSetNames.length === 0) {
        outputChannel.appendLine('  (none)');
    } else {
        for (const sourceSetName of sourceSetNames) {
            outputChannel.appendLine(`  ${sourceSetName}: ${stats.sourceSetCoverage[sourceSetName]} files`);
        }
    }
    outputChannel.appendLine('');

    // Output detailed results
    outputChannel.appendLine('Detailed Classification Results:');
    outputChannel.appendLine('-'.repeat(80));
    
    for (const result of results) {
        outputChannel.appendLine('');
        outputChannel.appendLine(`File: ${result.uri}`);
        outputChannel.appendLine(`  Physical Type: ${result.physicalType}`);
        outputChannel.appendLine(`  Role (Primary): ${result.rolePrimary}`);
        if (result.roleSecondary.length > 0) {
            outputChannel.appendLine(`  Role (Secondary): ${result.roleSecondary.join(', ')}`);
        }
        outputChannel.appendLine(`  Source of Truth: ${result.sourceOfTruth}`);
        outputChannel.appendLine(`  In Active Target: ${result.inActiveTarget}`);
        if (result.referencedBySourceSets && result.referencedBySourceSets.length > 0) {
            outputChannel.appendLine(`  Referenced by Source Sets: ${result.referencedBySourceSets.join(', ')}`);
        }
        if (result.referencedByTargets && result.referencedByTargets.length > 0) {
            outputChannel.appendLine(`  Referenced by Targets: ${result.referencedByTargets.join(', ')}`);
        }
    }

    outputChannel.appendLine('');
    outputChannel.appendLine('-'.repeat(80));
}

async function findHdlFiles(folder: vscode.WorkspaceFolder): Promise<vscode.Uri[]> {
    // Find all HDL files in workspace
    const patterns = [
        '**/*.v',
        '**/*.vh',
        '**/*.sv',
        '**/*.svh',
        '**/*.sva',
        '**/*.vhd',
        '**/*.vhdl',
        '**/*.xdc',
        '**/*.sdc',
        '**/*.tcl',
        '**/*.xci'
    ];

    const excludePatterns = [
        '**/node_modules/**',
        '**/.git/**',
        '**/.srcs/**',
        '**/.sim/**',
        '**/build/**',
        '**/out/**'
    ];

    const files: vscode.Uri[] = [];
    
    for (const pattern of patterns) {
        const found = await vscode.workspace.findFiles(
            new vscode.RelativePattern(folder, pattern),
            `{${excludePatterns.join(',')}}`
        );
        files.push(...found);
    }

    // Deduplicate
    const uniqueFiles = Array.from(new Set(files.map(f => f.fsPath)))
        .map(p => vscode.Uri.file(p));

    return uniqueFiles;
}

function groupByRole(results: FileClassificationResult[]): Record<string, FileClassificationResult[]> {
    const grouped: Record<string, FileClassificationResult[]> = {};

    for (const result of results) {
        const role = result.rolePrimary;
        if (!grouped[role]) {
            grouped[role] = [];
        }
        grouped[role].push(result);
    }

    return grouped;
}
