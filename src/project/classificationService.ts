/**
 * File classification service for HDL Helper workbench.
 * 
 * Responsible for:
 * - Classifying HDL files by engineering role
 * - Determining physical file type
 * - Tracking source of truth for classification
 * - Supporting both config-driven and heuristic classification
 * 
 * @module project/classificationService
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {
    FileClassificationResult,
    Role,
    PhysicalFileType,
    SourceOfTruth,
    NormalizedProjectConfig
} from './types';

/**
 * Classification context for a workspace.
 */
export interface ClassificationContext {
    workspaceRoot: string;
    projectConfig?: NormalizedProjectConfig;
    activeTarget?: string;
}

/**
 * File classification service.
 * Classifies files by role using config or heuristic rules.
 */
export class ClassificationService {
    private context: ClassificationContext;

    constructor(context: ClassificationContext) {
        this.context = context;
    }

    // ========================================================================
    // Public API
    // ========================================================================

    /**
     * Classify a single file.
     */
    public classifyFile(uri: vscode.Uri): FileClassificationResult {
        const physicalType = this.detectPhysicalType(uri);
        
        // Try config-driven classification first
        if (this.context.projectConfig) {
            const configResult = this.classifyByConfig(uri);
            if (configResult) {
                return configResult;
            }
        }

        // Fall back to heuristic classification
        return this.classifyByHeuristic(uri, physicalType);
    }

    /**
     * Classify all files in workspace.
     */
    public async classifyWorkspace(files: vscode.Uri[]): Promise<FileClassificationResult[]> {
        const results: FileClassificationResult[] = [];
        
        for (const file of files) {
            results.push(this.classifyFile(file));
        }

        return results;
    }

    /**
     * Update classification context (e.g., when config changes).
     */
    public updateContext(context: Partial<ClassificationContext>): void {
        this.context = { ...this.context, ...context };
    }

    // ========================================================================
    // Config-driven Classification
    // ========================================================================

    private classifyByConfig(uri: vscode.Uri): FileClassificationResult | undefined {
        if (!this.context.projectConfig) {
            return undefined;
        }

        const relativePath = this.getRelativePath(uri);
        const physicalType = this.detectPhysicalType(uri);
        
        // Check each source set for matches
        const matchedSets: string[] = [];
        let primaryRole: Role = Role.Unassigned;
        
        for (const [name, sourceSet] of Object.entries(this.context.projectConfig.sourceSets)) {
            if (this.matchesSourceSet(relativePath, sourceSet.includes, sourceSet.excludes)) {
                matchedSets.push(name);
                if (primaryRole === Role.Unassigned) {
                    primaryRole = sourceSet.role;
                }
            }
        }

        if (matchedSets.length > 0) {
            // Determine if in active target
            const inActiveTarget = this.isInActiveTarget(matchedSets);
            
            // Collect secondary roles
            const secondaryRoles = this.collectSecondaryRoles(matchedSets, primaryRole);

            return {
                uri: uri.fsPath,
                physicalType,
                rolePrimary: primaryRole,
                roleSecondary: secondaryRoles,
                sourceOfTruth: SourceOfTruth.ProjectConfig,
                inActiveTarget,
                referencedBySourceSets: matchedSets
            };
        }

        return undefined;
    }

    private matchesSourceSet(
        relativePath: string,
        includes: string[],
        excludes?: string[]
    ): boolean {
        // TODO: Implement glob pattern matching
        // For now, simple path prefix matching
        
        // Check excludes first
        if (excludes) {
            for (const pattern of excludes) {
                if (this.matchesPattern(relativePath, pattern)) {
                    return false;
                }
            }
        }

        // Check includes
        for (const pattern of includes) {
            if (this.matchesPattern(relativePath, pattern)) {
                return true;
            }
        }

        return false;
    }

    private matchesPattern(filePath: string, pattern: string): boolean {
        // Simple pattern matching (to be enhanced with proper glob)
        const normalizedPath = filePath.replace(/\\/g, '/');
        const normalizedPattern = pattern.replace(/\\/g, '/');
        
        // Exact match
        if (normalizedPath === normalizedPattern) {
            return true;
        }

        // Directory prefix match
        if (normalizedPattern.endsWith('/') || normalizedPattern.endsWith('/*')) {
            const dir = normalizedPattern.replace(/\/\*?$/, '');
            return normalizedPath.startsWith(dir + '/');
        }

        // Wildcard match (simple)
        if (normalizedPattern.includes('*')) {
            const regex = new RegExp('^' + normalizedPattern.replace(/\*/g, '.*') + '$');
            return regex.test(normalizedPath);
        }

        return false;
    }

    private isInActiveTarget(matchedSets: string[]): boolean {
        if (!this.context.projectConfig || !this.context.activeTarget) {
            return false;
        }

        const target = this.context.projectConfig.targets[this.context.activeTarget];
        if (!target) {
            return false;
        }

        // Check if any matched set is in active target's source sets
        return matchedSets.some(setName => target.sourceSets.includes(setName));
    }

    private collectSecondaryRoles(matchedSets: string[], primaryRole: Role): Role[] {
        if (!this.context.projectConfig) {
            return [];
        }

        const secondaryRoles: Role[] = [];
        for (const setName of matchedSets) {
            const sourceSet = this.context.projectConfig.sourceSets[setName];
            if (sourceSet && sourceSet.role !== primaryRole) {
                if (!secondaryRoles.includes(sourceSet.role)) {
                    secondaryRoles.push(sourceSet.role);
                }
            }
        }

        return secondaryRoles;
    }

    // ========================================================================
    // Heuristic Classification
    // ========================================================================

    private classifyByHeuristic(uri: vscode.Uri, physicalType: PhysicalFileType): FileClassificationResult {
        const relativePath = this.getRelativePath(uri);
        const fileName = path.basename(uri.fsPath);
        const dirName = path.basename(path.dirname(uri.fsPath));

        let role = Role.Unassigned;

        // Path-based rules
        if (this.matchesPathPattern(relativePath, ['rtl/', 'src/', 'design/', 'hdl/'])) {
            role = Role.Design;
        } else if (this.matchesPathPattern(relativePath, ['tb/', 'sim/', 'testbench/', 'test/'])) {
            role = Role.Simulation;
        } else if (this.matchesPathPattern(relativePath, ['sva/', 'checker/', 'bind/', 'assert/', 'verification/'])) {
            role = Role.Verification;
        } else if (this.matchesPathPattern(relativePath, ['constraints/', 'xdc/', 'sdc/'])) {
            role = Role.Constraints;
        } else if (this.matchesPathPattern(relativePath, ['scripts/', 'tcl/', 'flow/'])) {
            role = Role.Scripts;
        } else if (this.matchesPathPattern(relativePath, ['ip/', 'generated/', 'autogen/'])) {
            role = Role.IpGenerated;
        }

        // File name-based rules (override path if more specific)
        if (fileName.startsWith('tb_') || fileName.endsWith('_tb.v') || fileName.endsWith('_tb.sv')) {
            role = Role.Simulation;
        } else if (fileName.startsWith('sva_') || fileName.includes('_bind') || fileName.includes('_checker')) {
            role = Role.Verification;
        }

        // Extension-based rules (for non-HDL files)
        if (physicalType === PhysicalFileType.XDC || physicalType === PhysicalFileType.SDC) {
            role = Role.Constraints;
        } else if (physicalType === PhysicalFileType.Tcl) {
            role = Role.Scripts;
        } else if (physicalType === PhysicalFileType.XCI) {
            role = Role.IpGenerated;
        }

        return {
            uri: uri.fsPath,
            physicalType,
            rolePrimary: role,
            roleSecondary: [],
            sourceOfTruth: SourceOfTruth.Heuristic,
            inActiveTarget: false
        };
    }

    private matchesPathPattern(filePath: string, patterns: string[]): boolean {
        const normalized = filePath.replace(/\\/g, '/').toLowerCase();
        return patterns.some(pattern => {
            const normalizedPattern = pattern.toLowerCase();
            return normalized.includes(normalizedPattern);
        });
    }

    // ========================================================================
    // Physical Type Detection
    // ========================================================================

    private detectPhysicalType(uri: vscode.Uri): PhysicalFileType {
        const ext = path.extname(uri.fsPath).toLowerCase();
        
        switch (ext) {
            case '.v':
            case '.vh':
            case '.vl':
                return PhysicalFileType.Verilog;
            
            case '.sv':
            case '.svh':
            case '.sva':
                return PhysicalFileType.SystemVerilog;
            
            case '.vhd':
            case '.vhdl':
                return PhysicalFileType.VHDL;
            
            case '.sdc':
                return PhysicalFileType.SDC;
            
            case '.xdc':
                return PhysicalFileType.XDC;
            
            case '.tcl':
                return PhysicalFileType.Tcl;
            
            case '.xci':
                return PhysicalFileType.XCI;
            
            default:
                return PhysicalFileType.Unknown;
        }
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    private getRelativePath(uri: vscode.Uri): string {
        const workspaceRoot = this.context.workspaceRoot;
        const filePath = uri.fsPath;
        
        if (filePath.startsWith(workspaceRoot)) {
            return path.relative(workspaceRoot, filePath);
        }
        
        return filePath;
    }
}
