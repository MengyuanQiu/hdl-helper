/**
 * Core domain types for HDL Helper workbench architecture.
 * 
 * These types define the semantic model for project organization,
 * file classification, target resolution, and workbench state.
 * 
 * @module project/types
 */

// ============================================================================
// Enums and Constants
// ============================================================================

/**
 * Engineering role classification for HDL files.
 * Determines how files are grouped in the Sources view.
 */
export enum Role {
    Design = 'design',
    Simulation = 'simulation',
    Verification = 'verification',
    Constraints = 'constraints',
    Scripts = 'scripts',
    IpGenerated = 'ip_generated',
    Unassigned = 'unassigned'
}

/**
 * Physical file type based on extension and content.
 */
export enum PhysicalFileType {
    Verilog = 'verilog',
    SystemVerilog = 'systemverilog',
    VHDL = 'vhdl',
    SDC = 'sdc',
    XDC = 'xdc',
    Tcl = 'tcl',
    XCI = 'xci',
    Unknown = 'unknown'
}

/**
 * Source of truth for file classification.
 * Priority: ProjectConfig > TargetLocal > Filelist > Heuristic
 */
export enum SourceOfTruth {
    ProjectConfig = 'project_config',
    TargetLocal = 'target_local',
    Filelist = 'filelist',
    TaskReference = 'task_reference',
    Heuristic = 'heuristic'
}

/**
 * Target kind determines the semantic context for hierarchy and runs.
 */
export enum TargetKind {
    Design = 'design',
    Simulation = 'simulation',
    Synthesis = 'synthesis',
    Implementation = 'implementation'
}

/**
 * Project configuration status.
 */
export enum ProjectConfigStatus {
    Valid = 'valid',
    Missing = 'missing',
    Invalid = 'invalid',
    NotEnabled = 'not_enabled'
}

/**
 * Index status for workspace scanning.
 */
export enum IndexStatus {
    Idle = 'idle',
    Scanning = 'scanning',
    Ready = 'ready',
    Error = 'error'
}

// ============================================================================
// Project Configuration Types
// ============================================================================

/**
 * Normalized source set definition.
 * A source set is a named collection of file patterns with a primary role.
 */
export interface NormalizedSourceSet {
    name: string;
    role: Role;
    includes: string[];  // glob patterns
    excludes?: string[];
    includeDirs?: string[];
    defines?: Record<string, string>;
}

/**
 * Normalized target definition.
 * A target represents a specific build/run context with resolved sources.
 */
export interface NormalizedTarget {
    id: string;
    kind: TargetKind;
    top?: string;
    sourceSets: string[];  // references to source set names
    filelist?: string;
    constraints?: string[];
    scripts?: string[];
    toolProfile?: string;
    includeDirs?: string[];
    defines?: Record<string, string>;
}

/**
 * Normalized project configuration.
 * This is the canonical representation after parsing and validation.
 */
export interface NormalizedProjectConfig {
    version: string;
    name: string;
    root: string;
    sourceSets: Record<string, NormalizedSourceSet>;
    tops: {
        design?: string;
        simulation?: string;
    };
    targets: Record<string, NormalizedTarget>;
    activeTarget?: string;
}

// ============================================================================
// File Classification Types
// ============================================================================

/**
 * Result of file classification.
 * Contains all metadata needed to determine file grouping and target inclusion.
 */
export interface FileClassificationResult {
    uri: string;
    physicalType: PhysicalFileType;
    rolePrimary: Role;
    roleSecondary: Role[];
    sourceOfTruth: SourceOfTruth;
    inActiveTarget: boolean;
    referencedByTargets?: string[];
    referencedBySourceSets?: string[];
}

// ============================================================================
// Target Context Types
// ============================================================================

/**
 * Effective target context after resolution.
 * This is the computed semantic context for a specific target.
 */
export interface TargetContext {
    targetId: string;
    kind: TargetKind;
    top?: string;
    resolvedFiles: string[];
    includeDirs: string[];
    defines: Record<string, string>;
    constraints: string[];
    scripts: string[];
    filelist?: string;
    toolProfile?: string;
    sourceSets: string[];
}

// ============================================================================
// Workbench State Types
// ============================================================================

/**
 * Centralized workbench state.
 * All state changes must flow through StateService.
 */
export interface WorkbenchState {
    activeProject?: string;
    activeTarget?: string;
    designTop?: string;
    simulationTop?: string;
    projectConfigStatus: ProjectConfigStatus;
    indexStatus: IndexStatus;
    lastRunByTarget: Record<string, RunRecord>;
    toolchainStatusByProfile: Record<string, ToolchainStatus>;
}

/**
 * Run record for a specific target execution.
 */
export interface RunRecord {
    targetId: string;
    taskName?: string;
    timestamp: number;
    success: boolean;
    waveformPath?: string;
    logPath?: string;
    buildDir?: string;
}

/**
 * Toolchain health status.
 */
export interface ToolchainStatus {
    profile: string;
    available: boolean;
    missingTools: string[];
    lastChecked: number;
}

// ============================================================================
// View Model Types
// ============================================================================

/**
 * Explorer view model for tree rendering.
 * TreeProvider consumes this without doing classification or resolution.
 */
export interface ExplorerViewModel {
    project?: ProjectSection;
    sources: SourcesSection;
    hierarchy: HierarchySection;
    tasksAndRuns?: TasksAndRunsSection;
    diagnostics?: DiagnosticsSection;
}

export interface ProjectSection {
    name: string;
    status: ProjectConfigStatus;
    activeTarget?: string;
    toolchainStatus: ToolchainStatus[];
}

export interface SourcesSection {
    designSources: FileClassificationResult[];
    simulationSources: FileClassificationResult[];
    verificationSources: FileClassificationResult[];
    constraints: FileClassificationResult[];
    scripts: FileClassificationResult[];
    ipGenerated: FileClassificationResult[];
    unassigned: FileClassificationResult[];
}

export interface HierarchySection {
    designHierarchy?: HierarchyNode;
    simulationHierarchy?: HierarchyNode;
}

export interface HierarchyNode {
    moduleName: string;
    filePath?: string;
    children: HierarchyNode[];
}

export interface TasksAndRunsSection {
    tasks: TaskInfo[];
    recentRuns: RunRecord[];
}

export interface TaskInfo {
    name: string;
    targetId?: string;
    top?: string;
}

export interface DiagnosticsSection {
    configIssues: ConfigIssue[];
    targetIssues: TargetIssue[];
}

export interface ConfigIssue {
    severity: 'error' | 'warning' | 'info';
    message: string;
    location?: string;
}

export interface TargetIssue {
    targetId: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
}
