/**
 * Target context service for HDL Helper workbench.
 * 
 * Responsible for:
 * - Resolving effective target context
 * - Computing resolved file lists
 * - Merging target-local and project-global settings
 * - Providing semantic entry point for hierarchy and runs
 * 
 * @module project/targetContextService
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
    TargetContext,
    NormalizedProjectConfig,
    NormalizedTarget,
    TargetKind
} from './types';

/**
 * Target resolution options.
 */
export interface TargetResolutionOptions {
    projectConfig?: NormalizedProjectConfig;
    designTop?: string;
    simulationTop?: string;
}

/**
 * Target context service.
 * Resolves effective target context for hierarchy, runs, and diagnostics.
 */
export class TargetContextService {
    private workspaceRoot: string;
    private options: TargetResolutionOptions;
    private workspaceFilesCache?: string[];
    private sourceSetFilesCache = new Map<string, string[]>();

    constructor(workspaceRoot: string, options: TargetResolutionOptions = {}) {
        this.workspaceRoot = workspaceRoot;
        this.options = options;
    }

    // ========================================================================
    // Public API
    // ========================================================================

    /**
     * Get active target context.
     * Returns context for the currently active target.
     */
    public getActiveTargetContext(): TargetContext | undefined {
        if (!this.options.projectConfig) {
            // No config: return heuristic fallback context
            return this.getHeuristicContext();
        }

        const activeTargetId = this.options.projectConfig.activeTarget;
        if (!activeTargetId) {
            // No active target: return first valid target or fallback
            return this.getFirstValidTargetContext() || this.getHeuristicContext();
        }

        // Active target may be stale/invalid: fall back explicitly.
        return this.resolveTargetContext(activeTargetId)
            || this.getFirstValidTargetContext()
            || this.getHeuristicContext();
    }

    /**
     * Resolve target context by target ID.
     */
    public resolveTargetContext(targetId: string): TargetContext | undefined {
        if (!this.options.projectConfig) {
            return undefined;
        }

        const target = this.options.projectConfig.targets[targetId];
        if (!target) {
            return undefined;
        }

        return this.buildTargetContext(targetId, target);
    }

    /**
     * Get all available target contexts.
     */
    public getAllTargetContexts(): TargetContext[] {
        if (!this.options.projectConfig) {
            const heuristic = this.getHeuristicContext();
            return heuristic ? [heuristic] : [];
        }

        const contexts: TargetContext[] = [];
        for (const targetId of Object.keys(this.options.projectConfig.targets)) {
            const context = this.resolveTargetContext(targetId);
            if (context) {
                contexts.push(context);
            }
        }

        return contexts;
    }

    /**
     * Update resolution options (e.g., when config or tops change).
     */
    public updateOptions(options: Partial<TargetResolutionOptions>): void {
        this.options = { ...this.options, ...options };
        this.sourceSetFilesCache.clear();
        this.workspaceFilesCache = undefined;
    }

    // ========================================================================
    // Target Context Building
    // ========================================================================

    private buildTargetContext(targetId: string, target: NormalizedTarget): TargetContext {
        // Resolve top
        const top = this.resolveTop(target);

        // Resolve files from source sets
        const resolvedFiles = this.resolveFiles(target);

        // Merge include dirs (target-local overrides project-global)
        const includeDirs = this.mergeIncludeDirs(target);

        // Merge defines (target-local overrides project-global)
        const defines = this.mergeDefines(target);

        // Resolve constraints
        const constraints = target.constraints || [];

        // Resolve scripts
        const scripts = target.scripts || [];

        return {
            targetId,
            kind: target.kind,
            top,
            resolvedFiles,
            includeDirs,
            defines,
            constraints,
            scripts,
            filelist: target.filelist,
            toolProfile: target.toolProfile,
            sourceSets: target.sourceSets
        };
    }

    private resolveTop(target: NormalizedTarget): string | undefined {
        // Priority: target.top > tops.design/simulation by kind
        if (target.top) {
            return target.top;
        }

        if (!this.options.projectConfig) {
            return undefined;
        }

        const tops = this.options.projectConfig.tops;
        switch (target.kind) {
            case TargetKind.Simulation:
                return tops.simulation || this.options.simulationTop;
            case TargetKind.Design:
            case TargetKind.Synthesis:
            case TargetKind.Implementation:
                return tops.design || this.options.designTop;
            default:
                return undefined;
        }
    }

    private resolveFiles(target: NormalizedTarget): string[] {
        if (!this.options.projectConfig) {
            return [];
        }

        const files = new Set<string>();
        for (const setName of target.sourceSets) {
            const sourceSet = this.options.projectConfig.sourceSets[setName];
            if (!sourceSet) {
                continue;
            }

            const resolved = this.resolveSourceSetFiles(setName, sourceSet.includes, sourceSet.excludes);
            resolved.forEach(file => files.add(file));
        }

        return Array.from(files).sort((a, b) => a.localeCompare(b));
    }

    private resolveSourceSetFiles(setName: string, includes: string[], excludes?: string[]): string[] {
        const cached = this.sourceSetFilesCache.get(setName);
        if (cached) {
            return cached;
        }

        const workspaceFiles = this.getWorkspaceFiles();
        const resolved = workspaceFiles.filter(filePath => {
            const relPath = this.toRelativePath(filePath);
            const included = includes.some(pattern => this.matchesPattern(relPath, filePath, pattern));
            if (!included) {
                return false;
            }

            if (!excludes || excludes.length === 0) {
                return true;
            }

            return !excludes.some(pattern => this.matchesPattern(relPath, filePath, pattern));
        });

        this.sourceSetFilesCache.set(setName, resolved);
        return resolved;
    }

    private getWorkspaceFiles(): string[] {
        if (this.workspaceFilesCache) {
            return this.workspaceFilesCache;
        }

        const result: string[] = [];
        const stack: string[] = [this.workspaceRoot];
        const ignored = new Set(['.git', 'node_modules', 'out', '.vscode-test']);

        while (stack.length > 0) {
            const current = stack.pop() as string;
            let entries: fs.Dirent[];

            try {
                entries = fs.readdirSync(current, { withFileTypes: true });
            } catch {
                continue;
            }

            for (const entry of entries) {
                const fullPath = path.join(current, entry.name);
                if (entry.isDirectory()) {
                    if (ignored.has(entry.name)) {
                        continue;
                    }
                    stack.push(fullPath);
                    continue;
                }

                if (entry.isFile()) {
                    result.push(path.normalize(fullPath));
                }
            }
        }

        this.workspaceFilesCache = result;
        return result;
    }

    private toRelativePath(filePath: string): string {
        return path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/');
    }

    private matchesPattern(relativePath: string, absolutePath: string, pattern: string): boolean {
        const normalizedPattern = pattern.replace(/\\/g, '/');
        const normalizedRelative = relativePath.replace(/\\/g, '/');
        const normalizedAbsolute = absolutePath.replace(/\\/g, '/');

        if (normalizedPattern.startsWith('/')) {
            return this.globMatch(normalizedAbsolute, normalizedPattern);
        }

        return this.globMatch(normalizedRelative, normalizedPattern)
            || this.globMatch(normalizedAbsolute, normalizedPattern);
    }

    private globMatch(targetPath: string, pattern: string): boolean {
        if (!pattern) {
            return false;
        }

        const parts = pattern.split(/(\*\*\/|\*\*|\*|\?)/g);
        const regex = parts.map(part => {
            if (part === '**/') {
                return '(?:.*/)?';
            }
            if (part === '**') {
                return '.*';
            }
            if (part === '*') {
                return '[^/]*';
            }
            if (part === '?') {
                return '[^/]';
            }
            return part.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        }).join('');

        return new RegExp(`^${regex}$`).test(targetPath);
    }

    private mergeIncludeDirs(target: NormalizedTarget): string[] {
        const dirs: string[] = [];

        // Collect from source sets
        if (this.options.projectConfig) {
            for (const setName of target.sourceSets) {
                const sourceSet = this.options.projectConfig.sourceSets[setName];
                if (sourceSet?.includeDirs) {
                    dirs.push(...sourceSet.includeDirs);
                }
            }
        }

        // Target-local overrides (or augments)
        if (target.includeDirs) {
            dirs.push(...target.includeDirs);
        }

        // Deduplicate
        return Array.from(new Set(dirs));
    }

    private mergeDefines(target: NormalizedTarget): Record<string, string> {
        const defines: Record<string, string> = {};

        // Collect from source sets
        if (this.options.projectConfig) {
            for (const setName of target.sourceSets) {
                const sourceSet = this.options.projectConfig.sourceSets[setName];
                if (sourceSet?.defines) {
                    Object.assign(defines, sourceSet.defines);
                }
            }
        }

        // Target-local overrides
        if (target.defines) {
            Object.assign(defines, target.defines);
        }

        return defines;
    }

    // ========================================================================
    // Fallback Contexts
    // ========================================================================

    private getFirstValidTargetContext(): TargetContext | undefined {
        if (!this.options.projectConfig) {
            return undefined;
        }

        const targetIds = Object.keys(this.options.projectConfig.targets);
        if (targetIds.length === 0) {
            return undefined;
        }

        return this.resolveTargetContext(targetIds[0]);
    }

    private getHeuristicContext(): TargetContext | undefined {
        // Heuristic fallback when no config available
        // Use design top or simulation top from state
        
        const top = this.options.designTop || this.options.simulationTop;
        if (!top) {
            return undefined;
        }

        // Determine kind based on which top is set
        const kind = this.options.simulationTop 
            ? TargetKind.Simulation 
            : TargetKind.Design;

        return {
            targetId: 'heuristic-fallback',
            kind,
            top,
            resolvedFiles: [], // Will be resolved by legacy logic
            includeDirs: [],
            defines: {},
            constraints: [],
            scripts: [],
            sourceSets: []
        };
    }
}
