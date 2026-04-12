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
import { FileClassificationResult } from '../project/types';

export interface ClassificationObservabilityStats {
    totalFiles: number;
    sharedFiles: number;
    activeTargetFiles: number;
    sourceSetCoverage: Record<string, number>;
}

export interface ClassificationDebugReportInput {
    workspaceName: string;
    workspaceRoot: string;
    configStatus: string;
    config?: {
        name: string;
        version: string;
        sourceSetCount: number;
        targetCount: number;
        activeTarget?: string;
    };
    hdlFileCount: number;
    roleCounts: Record<string, number>;
    stats: ClassificationObservabilityStats;
    results: FileClassificationResult[];
}

export function buildClassificationObservabilityStats(
    results: FileClassificationResult[]
): ClassificationObservabilityStats {
    const sourceSetCoverage: Record<string, number> = {};

    for (const result of results) {
        for (const sourceSetName of new Set(result.referencedBySourceSets || [])) {
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

export function formatClassificationDebugReport(input: ClassificationDebugReportInput): string[] {
    const lines: string[] = [];
    lines.push(`Workspace: ${input.workspaceName}`);
    lines.push(`Root: ${input.workspaceRoot}`);
    lines.push('');

    lines.push(`Project Config Status: ${input.configStatus}`);
    if (input.config) {
        lines.push(`  Name: ${input.config.name}`);
        lines.push(`  Version: ${input.config.version}`);
        lines.push(`  Source Sets: ${input.config.sourceSetCount}`);
        lines.push(`  Targets: ${input.config.targetCount}`);
        lines.push(`  Active Target: ${input.config.activeTarget || 'none'}`);
    }
    lines.push('');

    lines.push(`Found ${input.hdlFileCount} HDL files`);
    lines.push('');

    lines.push('Classification Summary:');
    lines.push('-'.repeat(80));
    const roles = Object.keys(input.roleCounts).sort((a, b) => a.localeCompare(b));
    for (const role of roles) {
        lines.push(`  ${role}: ${input.roleCounts[role]} files`);
    }
    lines.push(`  shared files: ${input.stats.sharedFiles}`);
    lines.push(`  active target files: ${input.stats.activeTargetFiles}`);
    lines.push('');

    lines.push('SourceSet Coverage:');
    const sourceSetNames = Object.keys(input.stats.sourceSetCoverage).sort((a, b) => a.localeCompare(b));
    if (sourceSetNames.length === 0) {
        lines.push('  (none)');
    } else {
        for (const sourceSetName of sourceSetNames) {
            lines.push(`  ${sourceSetName}: ${input.stats.sourceSetCoverage[sourceSetName]} files`);
        }
    }
    lines.push('');

    lines.push('Detailed Classification Results:');
    lines.push('-'.repeat(80));

    for (const result of input.results) {
        lines.push('');
        lines.push(`File: ${result.uri}`);
        lines.push(`  Physical Type: ${result.physicalType}`);
        lines.push(`  Role (Primary): ${result.rolePrimary}`);
        if (result.roleSecondary.length > 0) {
            lines.push(`  Role (Secondary): ${result.roleSecondary.join(', ')}`);
        }
        lines.push(`  Source of Truth: ${result.sourceOfTruth}`);
        lines.push(`  In Active Target: ${result.inActiveTarget}`);
        if (result.referencedBySourceSets && result.referencedBySourceSets.length > 0) {
            lines.push(`  Referenced by Source Sets: ${result.referencedBySourceSets.join(', ')}`);
        }
        if (result.referencedByTargets && result.referencedByTargets.length > 0) {
            lines.push(`  Referenced by Targets: ${result.referencedByTargets.join(', ')}`);
        }
    }

    lines.push('');
    lines.push('-'.repeat(80));
    return lines;
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

    // Load project config if exists
    const configService = new ProjectConfigService(workspaceRoot);
    const config = await configService.loadConfig();
    const configStatus = configService.getStatus();

    // Find all HDL files
    const hdlFiles = await findHdlFiles(folder);

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
    const roleCounts: Record<string, number> = {};
    for (const [role, files] of Object.entries(byRole)) {
        roleCounts[role] = files.length;
    }

    const lines = formatClassificationDebugReport({
        workspaceName: folder.name,
        workspaceRoot,
        configStatus,
        config: config
            ? {
                name: config.name,
                version: config.version,
                sourceSetCount: Object.keys(config.sourceSets).length,
                targetCount: Object.keys(config.targets).length,
                activeTarget: config.activeTarget
            }
            : undefined,
        hdlFileCount: hdlFiles.length,
        roleCounts,
        stats,
        results
    });

    for (const line of lines) {
        outputChannel.appendLine(line);
    }
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
