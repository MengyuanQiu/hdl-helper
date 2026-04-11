/**
 * Project configuration service for HDL Helper workbench.
 * 
 * Responsible for:
 * - Reading and parsing .hdl-helper/project.json
 * - Schema validation
 * - Normalization to internal types
 * - Configuration status management
 * 
 * @module project/projectConfigService
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
    NormalizedProjectConfig,
    NormalizedSourceSet,
    NormalizedTarget,
    ProjectConfigStatus,
    Role,
    TargetKind
} from './types';

/**
 * Raw project configuration from JSON file.
 * This is the on-disk format before normalization.
 */
interface RawProjectConfig {
    version: string;
    name: string;
    root?: string;
    sourceSets?: Record<string, RawSourceSet>;
    tops?: {
        design?: string;
        simulation?: string;
    };
    targets?: Record<string, RawTarget>;
    activeTarget?: string;
}

interface RawSourceSet {
    role: string;
    includes: string[];
    excludes?: string[];
    includeDirs?: string[];
    defines?: Record<string, string>;
}

interface RawTarget {
    kind: string;
    top?: string;
    sourceSets: string[];
    filelist?: string;
    constraints?: string[];
    scripts?: string[];
    toolProfile?: string;
    includeDirs?: string[];
    defines?: Record<string, string>;
}

/**
 * Configuration validation result.
 */
export interface ConfigValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Project configuration service.
 * Handles reading, parsing, validating, and normalizing project.json.
 */
export class ProjectConfigService {
    private static readonly CONFIG_FILE_NAME = 'project.json';
    private static readonly CONFIG_DIR_NAME = '.hdl-helper';
    
    private workspaceRoot: string;
    private configPath: string;
    private cachedConfig?: NormalizedProjectConfig;
    private cachedStatus: ProjectConfigStatus = ProjectConfigStatus.NotEnabled;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.configPath = path.join(
            workspaceRoot,
            ProjectConfigService.CONFIG_DIR_NAME,
            ProjectConfigService.CONFIG_FILE_NAME
        );
    }

    // ========================================================================
    // Public API
    // ========================================================================

    /**
     * Check if project config exists.
     */
    public configExists(): boolean {
        return fs.existsSync(this.configPath);
    }

    /**
     * Get current configuration status.
     */
    public getStatus(): ProjectConfigStatus {
        return this.cachedStatus;
    }

    /**
     * Load and parse project configuration.
     * Returns normalized config or undefined if not available.
     */
    public async loadConfig(): Promise<NormalizedProjectConfig | undefined> {
        // Check if config exists
        if (!this.configExists()) {
            this.cachedStatus = ProjectConfigStatus.Missing;
            this.cachedConfig = undefined;
            return undefined;
        }

        try {
            // Read file
            const content = fs.readFileSync(this.configPath, 'utf-8');
            
            // Parse JSON
            const raw: RawProjectConfig = JSON.parse(content);
            
            // Validate
            const validation = this.validateConfig(raw);
            if (!validation.valid) {
                this.cachedStatus = ProjectConfigStatus.Invalid;
                this.cachedConfig = undefined;
                // TODO: Emit diagnostics for validation errors
                return undefined;
            }

            // Normalize
            const normalized = this.normalizeConfig(raw);
            this.cachedConfig = normalized;
            this.cachedStatus = ProjectConfigStatus.Valid;
            
            return normalized;
        } catch (error) {
            // Parse error or file read error
            this.cachedStatus = ProjectConfigStatus.Invalid;
            this.cachedConfig = undefined;
            // TODO: Emit diagnostics for parse error
            return undefined;
        }
    }

    /**
     * Get cached configuration without reloading.
     */
    public getCachedConfig(): NormalizedProjectConfig | undefined {
        return this.cachedConfig;
    }

    /**
     * Validate raw configuration.
     */
    public validateConfig(raw: RawProjectConfig): ConfigValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Required fields
        if (!raw.version) {
            errors.push('Missing required field: version');
        }
        if (!raw.name) {
            errors.push('Missing required field: name');
        }

        // Version format
        if (raw.version && !this.isValidVersion(raw.version)) {
            errors.push(`Invalid version format: ${raw.version}`);
        }

        // Source sets validation
        if (raw.sourceSets) {
            for (const [name, sourceSet] of Object.entries(raw.sourceSets)) {
                if (!sourceSet.role) {
                    errors.push(`Source set '${name}' missing required field: role`);
                }
                if (!sourceSet.includes || sourceSet.includes.length === 0) {
                    errors.push(`Source set '${name}' missing required field: includes`);
                }
                if (sourceSet.role && !this.isValidRole(sourceSet.role)) {
                    errors.push(`Source set '${name}' has invalid role: ${sourceSet.role}`);
                }
            }
        }

        // Targets validation
        if (raw.targets) {
            for (const [id, target] of Object.entries(raw.targets)) {
                if (!target.kind) {
                    errors.push(`Target '${id}' missing required field: kind`);
                }
                if (!target.sourceSets || target.sourceSets.length === 0) {
                    errors.push(`Target '${id}' missing required field: sourceSets`);
                }
                if (target.kind && !this.isValidTargetKind(target.kind)) {
                    errors.push(`Target '${id}' has invalid kind: ${target.kind}`);
                }
                
                // Check source set references
                if (raw.sourceSets && target.sourceSets) {
                    for (const ssName of target.sourceSets) {
                        if (!raw.sourceSets[ssName]) {
                            errors.push(`Target '${id}' references unknown source set: ${ssName}`);
                        }
                    }
                }
            }
        }

        // Active target validation
        if (raw.activeTarget && raw.targets && !raw.targets[raw.activeTarget]) {
            warnings.push(`Active target '${raw.activeTarget}' not found in targets`);
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Clear cached configuration and force reload on next access.
     */
    public clearCache(): void {
        this.cachedConfig = undefined;
        this.cachedStatus = ProjectConfigStatus.NotEnabled;
    }

    // ========================================================================
    // Private Helpers
    // ========================================================================

    private normalizeConfig(raw: RawProjectConfig): NormalizedProjectConfig {
        const sourceSets: Record<string, NormalizedSourceSet> = {};
        if (raw.sourceSets) {
            for (const [name, ss] of Object.entries(raw.sourceSets)) {
                sourceSets[name] = {
                    name,
                    role: this.normalizeRole(ss.role),
                    includes: ss.includes,
                    excludes: ss.excludes,
                    includeDirs: ss.includeDirs,
                    defines: ss.defines
                };
            }
        }

        const targets: Record<string, NormalizedTarget> = {};
        if (raw.targets) {
            for (const [id, t] of Object.entries(raw.targets)) {
                targets[id] = {
                    id,
                    kind: this.normalizeTargetKind(t.kind),
                    top: t.top,
                    sourceSets: t.sourceSets,
                    filelist: t.filelist,
                    constraints: t.constraints,
                    scripts: t.scripts,
                    toolProfile: t.toolProfile,
                    includeDirs: t.includeDirs,
                    defines: t.defines
                };
            }
        }

        return {
            version: raw.version,
            name: raw.name,
            root: raw.root || this.workspaceRoot,
            sourceSets,
            tops: raw.tops || {},
            targets,
            activeTarget: raw.activeTarget
        };
    }

    private normalizeRole(role: string): Role {
        const normalized = role.toLowerCase().replace(/[_-]/g, '_');
        switch (normalized) {
            case 'design': return Role.Design;
            case 'simulation': return Role.Simulation;
            case 'verification': return Role.Verification;
            case 'constraints': return Role.Constraints;
            case 'scripts': return Role.Scripts;
            case 'ip_generated': return Role.IpGenerated;
            default: return Role.Unassigned;
        }
    }

    private normalizeTargetKind(kind: string): TargetKind {
        const normalized = kind.toLowerCase();
        switch (normalized) {
            case 'design': return TargetKind.Design;
            case 'simulation': return TargetKind.Simulation;
            case 'synthesis': return TargetKind.Synthesis;
            case 'implementation': return TargetKind.Implementation;
            default: return TargetKind.Design;
        }
    }

    private isValidVersion(version: string): boolean {
        // Simple semver check: X.Y or X.Y.Z
        return /^\d+\.\d+(\.\d+)?$/.test(version);
    }

    private isValidRole(role: string): boolean {
        const validRoles = ['design', 'simulation', 'verification', 'constraints', 'scripts', 'ip_generated'];
        return validRoles.includes(role.toLowerCase());
    }

    private isValidTargetKind(kind: string): boolean {
        const validKinds = ['design', 'simulation', 'synthesis', 'implementation'];
        return validKinds.includes(kind.toLowerCase());
    }
}
