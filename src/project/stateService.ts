/**
 * Centralized state management service for HDL Helper workbench.
 * 
 * All workbench state changes must flow through this service.
 * Provides event emission for state changes and persistence via workspace memento.
 * 
 * @module project/stateService
 */

import * as vscode from 'vscode';
import {
    WorkbenchState,
    ProjectConfigStatus,
    IndexStatus,
    RunRecord,
    ToolchainStatus
} from './types';

/**
 * State change event types.
 */
export enum StateChangeEvent {
    ActiveProjectChanged = 'activeProjectChanged',
    ActiveTargetChanged = 'activeTargetChanged',
    DesignTopChanged = 'designTopChanged',
    SimulationTopChanged = 'simulationTopChanged',
    ProjectConfigStatusChanged = 'projectConfigStatusChanged',
    IndexStatusChanged = 'indexStatusChanged',
    RunRecorded = 'runRecorded',
    ToolchainStatusChanged = 'toolchainStatusChanged'
}

/**
 * Centralized state service.
 * Manages workbench state with persistence and event emission.
 */
export class StateService {
    private state: WorkbenchState;
    private memento: vscode.Memento;
    private eventEmitter: vscode.EventEmitter<StateChangeEvent>;
    public readonly onStateChange: vscode.Event<StateChangeEvent>;

    constructor(context: vscode.ExtensionContext) {
        this.memento = context.workspaceState;
        this.eventEmitter = new vscode.EventEmitter<StateChangeEvent>();
        this.onStateChange = this.eventEmitter.event;

        // Initialize state from memento or defaults
        this.state = this.loadState();
    }

    // ========================================================================
    // State Loading and Persistence
    // ========================================================================

    private loadState(): WorkbenchState {
        const saved = this.memento.get<Partial<WorkbenchState>>('workbenchState');
        return {
            activeProject: saved?.activeProject,
            activeTarget: saved?.activeTarget,
            designTop: saved?.designTop,
            simulationTop: saved?.simulationTop,
            projectConfigStatus: saved?.projectConfigStatus ?? ProjectConfigStatus.NotEnabled,
            indexStatus: saved?.indexStatus ?? IndexStatus.Idle,
            lastRunByTarget: saved?.lastRunByTarget ?? {},
            toolchainStatusByProfile: saved?.toolchainStatusByProfile ?? {}
        };
    }

    private async saveState(): Promise<void> {
        await this.memento.update('workbenchState', this.state);
    }

    // ========================================================================
    // Active Project
    // ========================================================================

    public getActiveProject(): string | undefined {
        return this.state.activeProject;
    }

    public async setActiveProject(project: string | undefined): Promise<void> {
        if (this.state.activeProject !== project) {
            this.state.activeProject = project;
            await this.saveState();
            this.eventEmitter.fire(StateChangeEvent.ActiveProjectChanged);
        }
    }

    // ========================================================================
    // Active Target
    // ========================================================================

    public getActiveTarget(): string | undefined {
        return this.state.activeTarget;
    }

    public async setActiveTarget(target: string | undefined): Promise<void> {
        if (this.state.activeTarget !== target) {
            this.state.activeTarget = target;
            await this.saveState();
            this.eventEmitter.fire(StateChangeEvent.ActiveTargetChanged);
        }
    }

    // ========================================================================
    // Design Top
    // ========================================================================

    public getDesignTop(): string | undefined {
        return this.state.designTop;
    }

    public async setDesignTop(top: string | undefined): Promise<void> {
        if (this.state.designTop !== top) {
            this.state.designTop = top;
            await this.saveState();
            this.eventEmitter.fire(StateChangeEvent.DesignTopChanged);
        }
    }

    // ========================================================================
    // Simulation Top
    // ========================================================================

    public getSimulationTop(): string | undefined {
        return this.state.simulationTop;
    }

    public async setSimulationTop(top: string | undefined): Promise<void> {
        if (this.state.simulationTop !== top) {
            this.state.simulationTop = top;
            await this.saveState();
            this.eventEmitter.fire(StateChangeEvent.SimulationTopChanged);
        }
    }

    // ========================================================================
    // Project Config Status
    // ========================================================================

    public getProjectConfigStatus(): ProjectConfigStatus {
        return this.state.projectConfigStatus;
    }

    public async setProjectConfigStatus(status: ProjectConfigStatus): Promise<void> {
        if (this.state.projectConfigStatus !== status) {
            this.state.projectConfigStatus = status;
            await this.saveState();
            this.eventEmitter.fire(StateChangeEvent.ProjectConfigStatusChanged);
        }
    }

    // ========================================================================
    // Index Status
    // ========================================================================

    public getIndexStatus(): IndexStatus {
        return this.state.indexStatus;
    }

    public async setIndexStatus(status: IndexStatus): Promise<void> {
        if (this.state.indexStatus !== status) {
            this.state.indexStatus = status;
            await this.saveState();
            this.eventEmitter.fire(StateChangeEvent.IndexStatusChanged);
        }
    }

    // ========================================================================
    // Run Records
    // ========================================================================

    public getLastRunByTarget(targetId: string): RunRecord | undefined {
        return this.state.lastRunByTarget[targetId];
    }

    public getAllRunRecords(): Record<string, RunRecord> {
        return { ...this.state.lastRunByTarget };
    }

    public async setLastRunForTarget(targetId: string, record: RunRecord): Promise<void> {
        this.state.lastRunByTarget[targetId] = record;
        await this.saveState();
        this.eventEmitter.fire(StateChangeEvent.RunRecorded);
    }

    public async clearRunRecords(): Promise<void> {
        this.state.lastRunByTarget = {};
        await this.saveState();
        this.eventEmitter.fire(StateChangeEvent.RunRecorded);
    }

    // ========================================================================
    // Toolchain Status
    // ========================================================================

    public getToolchainStatus(profile: string): ToolchainStatus | undefined {
        return this.state.toolchainStatusByProfile[profile];
    }

    public getAllToolchainStatus(): Record<string, ToolchainStatus> {
        return { ...this.state.toolchainStatusByProfile };
    }

    public async setToolchainStatus(profile: string, status: ToolchainStatus): Promise<void> {
        this.state.toolchainStatusByProfile[profile] = status;
        await this.saveState();
        this.eventEmitter.fire(StateChangeEvent.ToolchainStatusChanged);
    }

    // ========================================================================
    // Full State Access (for debugging)
    // ========================================================================

    public getFullState(): Readonly<WorkbenchState> {
        return { ...this.state };
    }

    // ========================================================================
    // Cleanup
    // ========================================================================

    public dispose(): void {
        this.eventEmitter.dispose();
    }
}
