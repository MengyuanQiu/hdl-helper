import * as vscode from 'vscode';
import { ProjectManager } from './projectManager';
import { HdlModule, HdlInstance } from './hdlSymbol';
import * as path from 'path';
import { buildConfigIssues } from './configDiagnostics';
import { ClassificationService } from './classificationService';
import { ProjectConfigService } from './projectConfigService';
import { ExplorerViewModelBuilder } from './explorerViewModelBuilder';
import { HierarchyService } from './hierarchyService';
import { TargetContextService } from './targetContextService';
import {
    FileClassificationResult,
    Role,
    RunRecord,
    SourceOfTruth,
    ProjectConfigStatus,
    SourcesSection
} from './types';

/**
 * 树节点类型：可能是“模块定义”或者“实例化引用”
 */
type HdlItem = HdlModule | HdlInstance | HdlInfoItem;

class HdlInfoItem extends vscode.TreeItem {
    constructor(label: string, description: string, icon: string, command?: vscode.Command) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = description;
        this.iconPath = new vscode.ThemeIcon(icon);
        this.contextValue = 'info';
        this.command = command;
    }
}

class SourcesRootItem extends vscode.TreeItem {
    constructor() {
        super('Sources', vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = new vscode.ThemeIcon('files');
        this.contextValue = 'sources-root';
    }
}

class SourceGroupItem extends vscode.TreeItem {
    constructor(
        label: string,
        readonly files: FileClassificationResult[],
        icon: string
    ) {
        super(
            label,
            files.length > 0
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
        );
        this.description = files.length === 1 ? '1 file' : `${files.length} files`;
        this.iconPath = new vscode.ThemeIcon(icon);
        this.contextValue = 'sources-group';
    }
}

class SourceFileItem extends vscode.TreeItem {
    constructor(readonly file: FileClassificationResult) {
        super(
            `[${SourceFileItem.roleBadge(file.rolePrimary)}] ${path.basename(file.uri)}`,
            vscode.TreeItemCollapsibleState.None
        );
        this.iconPath = new vscode.ThemeIcon(SourceFileItem.iconForRole(file.rolePrimary));
        this.contextValue = `sources-file.${file.rolePrimary}`;
        this.resourceUri = vscode.Uri.file(file.uri);
        this.command = {
            command: 'vscode.open',
            title: 'Open File',
            arguments: [vscode.Uri.file(file.uri)]
        };

        this.tooltip = SourceFileItem.buildTooltip(file);
    }

    private static roleBadge(role: Role): string {
        switch (role) {
            case Role.Design:
                return 'D';
            case Role.Simulation:
                return 'SIM';
            case Role.Verification:
                return 'VER';
            case Role.Constraints:
                return 'CST';
            case Role.Scripts:
                return 'SCR';
            case Role.IpGenerated:
                return 'IP';
            default:
                return 'U';
        }
    }

    private static iconForRole(role: Role): string {
        switch (role) {
            case Role.Design:
                return 'symbol-module';
            case Role.Simulation:
                return 'beaker';
            case Role.Verification:
                return 'checklist';
            case Role.Constraints:
                return 'symbol-key';
            case Role.Scripts:
                return 'terminal-powershell';
            case Role.IpGenerated:
                return 'package';
            default:
                return 'question';
        }
    }

    private static sourceTag(source: SourceOfTruth): string {
        switch (source) {
            case SourceOfTruth.ProjectConfig:
                return 'config';
            case SourceOfTruth.TargetLocal:
                return 'target';
            case SourceOfTruth.Filelist:
                return 'filelist';
            case SourceOfTruth.TaskReference:
                return 'task';
            default:
                return 'heuristic';
        }
    }

    private static buildTooltip(file: FileClassificationResult): vscode.MarkdownString {
        const tip = new vscode.MarkdownString(undefined, true);
        tip.isTrusted = false;
        tip.supportHtml = false;
        tip.appendMarkdown(`**${path.basename(file.uri)}**\n\n`);
        tip.appendMarkdown(`- Role: ${file.rolePrimary}\n`);
        tip.appendMarkdown(`- Source: ${SourceFileItem.sourceTag(file.sourceOfTruth)}\n`);
        tip.appendMarkdown(`- In Active Target: ${file.inActiveTarget ? 'yes' : 'no'}\n`);
        tip.appendMarkdown(`- Path: ${file.uri}`);
        return tip;
    }
}

class LegacyHierarchyRootItem extends vscode.TreeItem {
    constructor() {
        super('Module Hierarchy (Legacy)', vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = new vscode.ThemeIcon('symbol-class');
        this.contextValue = 'legacy-hierarchy-root';
    }
}

class DesignHierarchyRootItem extends vscode.TreeItem {
    constructor() {
        super('Design Hierarchy', vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = new vscode.ThemeIcon('symbol-namespace');
        this.contextValue = 'design-hierarchy-root';
    }
}

class SimulationHierarchyRootItem extends vscode.TreeItem {
    constructor() {
        super('Simulation Hierarchy', vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = new vscode.ThemeIcon('beaker');
        this.contextValue = 'simulation-hierarchy-root';
    }
}

class DiagnosticsRootItem extends vscode.TreeItem {
    constructor() {
        super('Diagnostics', vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = new vscode.ThemeIcon('warning');
        this.contextValue = 'diagnostics-root';
    }
}

class TasksRunsRootItem extends vscode.TreeItem {
    constructor() {
        super('Tasks and Runs', vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = new vscode.ThemeIcon('run-all');
        this.contextValue = 'tasks-runs-root';
    }
}

class RunRecordItem extends vscode.TreeItem {
    constructor(readonly targetId: string, readonly record: RunRecord) {
        super(targetId, vscode.TreeItemCollapsibleState.None);
        this.description = record.success ? 'success' : 'failed';
        this.tooltip = `${record.taskName || 'n/a'} | ${new Date(record.timestamp).toLocaleString()}`;
        this.iconPath = new vscode.ThemeIcon(record.success ? 'pass' : 'warning');
        this.contextValue = 'run-record';
        this.command = {
            command: 'hdl-helper.openRunRecordArtifacts',
            title: 'Open Run Record Artifacts',
            arguments: [targetId]
        };
    }
}

type HierarchyKind = 'design' | 'simulation';

class ScopedModuleItem {
    constructor(
        readonly module: HdlModule,
        readonly kind: HierarchyKind
    ) {}
}

class ScopedInstanceItem {
    constructor(
        readonly instance: HdlInstance,
        readonly kind: HierarchyKind
    ) {}
}

type HdlTreeItem =
    | HdlModule
    | HdlInstance
    | ScopedModuleItem
    | ScopedInstanceItem
    | HdlInfoItem
    | SourcesRootItem
    | SourceGroupItem
    | SourceFileItem
    | LegacyHierarchyRootItem
    | DesignHierarchyRootItem
    | SimulationHierarchyRootItem
    | DiagnosticsRootItem
    | TasksRunsRootItem
    | RunRecordItem;

export class HdlTreeProvider implements vscode.TreeDataProvider<HdlTreeItem> {
    // 事件发射器：当数据变化时，通知 VS Code 刷新 UI
    private _onDidChangeTreeData: vscode.EventEmitter<HdlTreeItem | undefined | null | void> = new vscode.EventEmitter<HdlTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<HdlTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    // 当前选中的 Top 模块名
    private topModuleName: string | null = null;
    private designTopModuleName: string | null = null;
    private simulationTopModuleName: string | null = null;
    private readonly hierarchyService = new HierarchyService();
    private scopedModuleNameCache: Partial<Record<HierarchyKind, Set<string>>> = {};
    private readonly getRunRecords: () => Record<string, RunRecord>;

    constructor(private projectManager: ProjectManager, getRunRecords?: () => Record<string, RunRecord>) {
        this.getRunRecords = getRunRecords || (() => ({}));
    }

    /**
     * 设置 Top Module 并刷新
     */
    public setTopModule(name: string | null) {
        this.topModuleName = name;
        this.refresh(); // 触发刷新
    }

    public setDesignTopModule(name: string | null) {
        this.designTopModuleName = name;
        this.refresh();
    }

    public setSimulationTopModule(name: string | null) {
        this.simulationTopModuleName = name;
        this.refresh();
    }

    public clearScopedTops() {
        this.designTopModuleName = null;
        this.simulationTopModuleName = null;
        this.refresh();
    }

    /**
     * 强制刷新 UI
     */
    refresh(): void {
        this.scopedModuleNameCache = {};
        this._onDidChangeTreeData.fire();
    }

    /**
     * 获取单个节点的 UI 信息
     */
    getTreeItem(element: HdlTreeItem): vscode.TreeItem {
        if (element instanceof HdlInfoItem) {
            return element;
        }

        if (element instanceof SourcesRootItem) {
            return element;
        }

        if (element instanceof SourceGroupItem) {
            return element;
        }

        if (element instanceof SourceFileItem) {
            const item = element;
            const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(element.file.uri));
            if (folder) {
                const rel = path.relative(folder.uri.fsPath, element.file.uri);
                item.description = `${rel} (${element.file.sourceOfTruth})`;
            } else {
                item.description = `${element.file.uri} (${element.file.sourceOfTruth})`;
            }
            return item;
        }

        if (element instanceof LegacyHierarchyRootItem) {
            return element;
        }

        if (element instanceof DesignHierarchyRootItem) {
            return element;
        }

        if (element instanceof SimulationHierarchyRootItem) {
            return element;
        }

        if (element instanceof DiagnosticsRootItem) {
            return element;
        }

        if (element instanceof TasksRunsRootItem) {
            return element;
        }

        if (element instanceof RunRecordItem) {
            return element;
        }

        if (element instanceof ScopedModuleItem) {
            return this.createModuleTreeItem(element.module);
        }

        if (element instanceof ScopedInstanceItem) {
            const moduleDef = this.projectManager.getModuleInWorkspace(
                element.instance.type,
                element.instance.fileUri
            );
            const hasChildren = moduleDef !== undefined && this.isModuleInScopeSync(moduleDef.name, element.kind);
            return this.createInstanceTreeItem(element.instance, hasChildren);
        }

        if (element instanceof HdlModule) {
            return this.createModuleTreeItem(element);
        } else {
            const moduleDef = this.projectManager.getModuleInWorkspace(element.type, element.fileUri);
            const hasChildren = moduleDef !== undefined;
            return this.createInstanceTreeItem(element, hasChildren);
        }
    }

    /**
     * 获取子节点 (递归核心)
     */
    async getChildren(element?: HdlTreeItem): Promise<HdlTreeItem[]> {
        // 1. 根节点 (Root)
        if (!element) {
            if (this.projectManager.isScanning()) {
                return [
                    new HdlInfoItem(
                        'Scanning HDL files...',
                        'Project index is being built',
                        'sync~spin'
                    )
                ];
            }

            if (this.isRoleGroupedSourcesEnabled()) {
                const roots: HdlTreeItem[] = [new SourcesRootItem()];
                if (this.isDualHierarchyEnabled()) {
                    roots.push(new DesignHierarchyRootItem(), new SimulationHierarchyRootItem());
                }
                if (this.isProjectConfigDiagnosticsEnabled()) {
                    roots.push(new DiagnosticsRootItem());
                }
                if (this.isTargetDrivenRunsEnabled()) {
                    roots.push(new TasksRunsRootItem());
                }
                if (this.isLegacyHierarchyVisibleWithSources()) {
                    roots.push(new LegacyHierarchyRootItem());
                }
                return roots;
            }

            return this.getLegacyRootChildren();
        }

        if (element instanceof SourcesRootItem) {
            const sources = await this.getMergedSourcesSection();
            return this.buildSourceGroupItems(sources);
        }

        if (element instanceof SourceGroupItem) {
            return element.files.map(file => new SourceFileItem(file));
        }

        if (element instanceof SourceFileItem) {
            return [];
        }

        if (element instanceof LegacyHierarchyRootItem) {
            return this.getLegacyRootChildren();
        }

        if (element instanceof DesignHierarchyRootItem) {
            return this.getScopedHierarchyChildren('design');
        }

        if (element instanceof SimulationHierarchyRootItem) {
            return this.getScopedHierarchyChildren('simulation');
        }

        if (element instanceof DiagnosticsRootItem) {
            return this.getDiagnosticsChildren();
        }

        if (element instanceof TasksRunsRootItem) {
            return this.getTasksRunsChildren();
        }

        if (element instanceof ScopedModuleItem) {
            return element.module.instances.map(instance => new ScopedInstanceItem(instance, element.kind));
        }

        if (element instanceof ScopedInstanceItem) {
            const moduleDef = this.projectManager.getModuleInWorkspace(
                element.instance.type,
                element.instance.fileUri
            );
            if (moduleDef && await this.isModuleInScope(moduleDef.name, element.kind)) {
                return moduleDef.instances.map(instance => new ScopedInstanceItem(instance, element.kind));
            }

            return [];
        }

        if (element instanceof HdlInfoItem) {
            return [];
        }

        // 2. 如果当前节点是“模块定义” (Module) -> 返回它内部的实例化
        if (element instanceof HdlModule) {
            return element.instances;
        } 
        
        // 3. 🔥 如果当前节点是“实例化” (Instance) -> 查找它的定义，并返回定义的子节点！
        // 这就是实现 "无限套娃" 的关键
        if (element instanceof HdlInstance) {
            const moduleDef = this.projectManager.getModuleInWorkspace(element.type, element.fileUri);
            if (moduleDef) {
                // 这里我们要返回的是 moduleDef 的 instances
                // 但是！TreeItem 需要知道父子关系吗？在这个简单版里不需要，
                // 直接把下一层的 instances 返回给 VS Code 即可。
                return moduleDef.instances;
            } else {
                return []; // 没找到定义 (比如标准库原语)，到底了
            }
        }

        return [];
    }

    private isRoleGroupedSourcesEnabled(): boolean {
        return vscode.workspace
            .getConfiguration('hdl-helper')
            .get<boolean>('workbench.roleGroupedSources', false);
    }

    private isLegacyHierarchyVisibleWithSources(): boolean {
        return vscode.workspace
            .getConfiguration('hdl-helper')
            .get<boolean>('workbench.sources.showLegacyHierarchy', true);
    }

    private isDualHierarchyEnabled(): boolean {
        const dualHierarchy = vscode.workspace
            .getConfiguration('hdl-helper')
            .get<boolean>('workbench.dualHierarchy', false);

        return this.isRoleGroupedSourcesEnabled() && dualHierarchy;
    }

    private isProjectConfigDiagnosticsEnabled(): boolean {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return false;
        }

        return folders.some(folder => vscode.workspace
            .getConfiguration('hdl-helper', folder.uri)
            .get<boolean>('projectConfig.enabled', false));
    }

    private isTargetDrivenRunsEnabled(): boolean {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return false;
        }

        return folders.some(folder => vscode.workspace
            .getConfiguration('hdl-helper', folder.uri)
            .get<boolean>('targetDrivenRuns.enabled', false));
    }

    private async getTasksRunsChildren(): Promise<HdlTreeItem[]> {
        const records = this.getRunRecords();
        const entries = Object.entries(records)
            .map(([targetId, record]) => ({ targetId, record }))
            .sort((a, b) => b.record.timestamp - a.record.timestamp);

        if (entries.length === 0) {
            return [new HdlInfoItem('No recent runs', 'Run simulation to populate target records', 'info')];
        }

        return entries.map(entry => new RunRecordItem(entry.targetId, entry.record));
    }

    private async getDiagnosticsChildren(): Promise<HdlTreeItem[]> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return [new HdlInfoItem('No workspace folder open', 'Open a workspace to inspect diagnostics', 'info')];
        }

        const items: HdlTreeItem[] = [];
        for (const folder of folders) {
            const configEnabled = vscode.workspace
                .getConfiguration('hdl-helper', folder.uri)
                .get<boolean>('projectConfig.enabled', false);

            if (!configEnabled) {
                continue;
            }

            const configService = new ProjectConfigService(folder.uri.fsPath);
            const config = await configService.loadConfig();
            const status = configService.getStatus();
            const issues = configService.getIssues();
            const entries = buildConfigIssues({
                configEnabled,
                status,
                config,
                errors: issues.errors,
                warnings: issues.warnings
            });

            for (const entry of entries) {
                const icon = entry.severity === 'error'
                    ? 'error'
                    : entry.severity === 'warning'
                        ? 'warning'
                        : 'info';
                const command = {
                    command: 'hdl-helper.openProjectConfig',
                    title: 'Open Project Config'
                };
                items.push(new HdlInfoItem(`[${folder.name}] ${entry.message}`, `config:${status}`, icon, command));
            }

            const targetContextService = new TargetContextService(folder.uri.fsPath, {
                projectConfig: config,
                designTop: this.designTopModuleName || undefined,
                simulationTop: this.simulationTopModuleName || undefined
            });
            const activeContext = targetContextService.getActiveTargetContext();

            if (config?.activeTarget && !config.targets[config.activeTarget]) {
                items.push(new HdlInfoItem(
                    `[${folder.name}] activeTarget '${config.activeTarget}' is invalid; fallback context is used.`,
                    `config:${status}`,
                    'warning',
                    {
                        command: 'hdl-helper.openProjectConfig',
                        title: 'Open Project Config'
                    }
                ));
            }

            if (!activeContext) {
                items.push(new HdlInfoItem(
                    `[${folder.name}] unable to resolve active target context.`,
                    `config:${status}`,
                    'error',
                    {
                        command: 'hdl-helper.openProjectConfig',
                        title: 'Open Project Config'
                    }
                ));
            } else if (!activeContext.top) {
                items.push(new HdlInfoItem(
                    `[${folder.name}] active target '${activeContext.targetId}' has no resolved top.`,
                    `config:${status}`,
                    'warning',
                    {
                        command: 'hdl-helper.openProjectConfig',
                        title: 'Open Project Config'
                    }
                ));
            }

            configService.dispose();
        }

        if (items.length > 0) {
            return items;
        }

        return [new HdlInfoItem('No config issues detected', 'project config diagnostics are clean', 'pass')];
    }

    private getLegacyRootChildren(): HdlTreeItem[] {
        // 如果用户设置了 Top，只显示那个 Top
        if (this.topModuleName) {
            const top = this.projectManager.getModule(this.topModuleName);
            return top ? [top] : [];
        }

        // 没设置 Top，显示所有模块
        const allModules = this.projectManager.getAllModules();
        if (allModules.length > 0) {
            return allModules;
        }

        const summary = this.projectManager.getLastScanSummary();
        if (summary.lastError) {
            return [
                new HdlInfoItem(
                    'Project scan failed',
                    'Click to rescan project',
                    'error',
                    {
                        command: 'hdl-helper.refreshProject',
                        title: 'Rescan Project'
                    }
                )
            ];
        }

        return [
            new HdlInfoItem(
                'No modules found',
                'Open a .v/.sv file and click to rescan',
                'info',
                {
                    command: 'hdl-helper.refreshProject',
                    title: 'Rescan Project'
                }
            )
        ];
    }

    private async getScopedHierarchyChildren(kind: HierarchyKind): Promise<HdlTreeItem[]> {
        const scopedNames = await this.getScopedModuleNameSet(kind);
        const scopedModules = this.projectManager
            .getAllModules()
            .filter(module => scopedNames.has(module.name));

        const topName = this.resolveScopedTop(kind, scopedModules);
        if (!topName) {
            return [
                new HdlInfoItem(
                    kind === 'design' ? 'Design top is not set' : 'Simulation top is not set',
                    kind === 'design'
                        ? 'Right-click a module and run Set as Design Top'
                        : 'Right-click a module and run Set as Simulation Top',
                    'info'
                )
            ];
        }

        const topModule = this.projectManager.getModule(topName);
        if (topModule && scopedNames.has(topModule.name)) {
            return [new ScopedModuleItem(topModule, kind)];
        }

        if (topModule && !scopedNames.has(topModule.name)) {
            return [
                new HdlInfoItem(
                    `${kind === 'design' ? 'Design' : 'Simulation'} top is out of scoped sources`,
                    `${topName} is outside ${kind} hierarchy source scope. Adjust top or source grouping.`,
                    'warning'
                )
            ];
        }

        return [
            new HdlInfoItem(
                `${kind === 'design' ? 'Design' : 'Simulation'} top not found`,
                `${topName} is not in the current project index. Click to rescan.`,
                'warning',
                {
                    command: 'hdl-helper.refreshProject',
                    title: 'Rescan Project'
                }
            )
        ];
    }

    private resolveScopedTop(kind: HierarchyKind, scopedModules: HdlModule[]): string | undefined {
        if (kind === 'design' && this.designTopModuleName) {
            return this.designTopModuleName;
        }
        if (kind === 'simulation' && this.simulationTopModuleName) {
            return this.simulationTopModuleName;
        }

        if (kind === 'design' && this.topModuleName) {
            return this.topModuleName;
        }

        const candidates = scopedModules.length > 0
            ? scopedModules
            : this.projectManager.getAllModules();

        if (candidates.length === 0) {
            return undefined;
        }

        return kind === 'simulation'
            ? this.hierarchyService.inferSimulationTop(candidates)
            : this.hierarchyService.inferDesignTop(candidates);
    }

    private async getScopedModuleNameSet(kind: HierarchyKind): Promise<Set<string>> {
        const cached = this.scopedModuleNameCache[kind];
        if (cached) {
            return cached;
        }

        const sources = await this.getMergedSourcesSection();
        const allModules = this.projectManager.getAllModules();
        const fileSet = kind === 'design'
            ? this.toNormalizedFileSet([...sources.designSources, ...sources.ipGenerated])
            : this.toNormalizedFileSet([
                ...sources.designSources,
                ...sources.simulationSources,
                ...sources.verificationSources,
                ...sources.ipGenerated
            ]);

        const scopedNames = new Set(
            allModules
                .filter(module => fileSet.has(path.normalize(module.fileUri.fsPath)))
                .map(module => module.name)
        );

        // Fallback to full module set to avoid empty hierarchy when source scan is incomplete.
        if (scopedNames.size === 0) {
            allModules.forEach(module => scopedNames.add(module.name));
        }

        this.scopedModuleNameCache[kind] = scopedNames;
        return scopedNames;
    }

    private async isModuleInScope(moduleName: string, kind: HierarchyKind): Promise<boolean> {
        const scopedNames = await this.getScopedModuleNameSet(kind);
        return scopedNames.has(moduleName);
    }

    private isModuleInScopeSync(moduleName: string, kind: HierarchyKind): boolean {
        const scopedNames = this.scopedModuleNameCache[kind];
        if (!scopedNames) {
            return true;
        }

        return scopedNames.has(moduleName);
    }

    private toNormalizedFileSet(files: FileClassificationResult[]): Set<string> {
        return new Set(files.map(file => path.normalize(file.uri)));
    }

    private createModuleTreeItem(module: HdlModule): vscode.TreeItem {
        const item = new vscode.TreeItem(module.name, vscode.TreeItemCollapsibleState.Collapsed);
        item.description = path.basename(module.fileUri.fsPath);
        item.iconPath = new vscode.ThemeIcon('symbol-class');
        item.contextValue = 'module';
        item.command = {
            command: 'vscode.open',
            title: 'Open File',
            arguments: [module.fileUri, { selection: module.range }]
        };
        return item;
    }

    private createInstanceTreeItem(instance: HdlInstance, hasChildren: boolean): vscode.TreeItem {
        const label = `${instance.name} : ${instance.type}`;
        const state = hasChildren
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None;

        const item = new vscode.TreeItem(label, state);
        item.iconPath = new vscode.ThemeIcon('symbol-field');
        item.contextValue = 'instance';
        item.command = {
            command: 'vscode.open',
            title: 'Open File',
            arguments: [instance.fileUri, { selection: instance.range }]
        };
        return item;
    }

    private async getMergedSourcesSection(): Promise<SourcesSection> {
        const merged = this.createEmptySourcesSection();
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return merged;
        }

        for (const folder of folders) {
            const workspaceRoot = folder.uri.fsPath;
            const configEnabled = vscode.workspace
                .getConfiguration('hdl-helper', folder.uri)
                .get<boolean>('projectConfig.enabled', false);

            let projectConfigStatus = ProjectConfigStatus.NotEnabled;
            let projectConfig;

            if (configEnabled) {
                const configService = new ProjectConfigService(workspaceRoot);
                projectConfig = await configService.loadConfig();
                projectConfigStatus = configService.getStatus();
                configService.dispose();
            }

            const files = await this.findSourceFiles(folder);
            const classifier = new ClassificationService({
                workspaceRoot,
                projectConfig,
                activeTarget: projectConfig?.activeTarget
            });

            const results = await classifier.classifyWorkspace(files);
            const builder = new ExplorerViewModelBuilder({
                workspaceRoot,
                projectName: projectConfig?.name,
                projectConfigStatus,
                activeTarget: projectConfig?.activeTarget,
                classificationResults: results
            });

            this.appendSources(merged, builder.build().sources);
        }

        return merged;
    }

    private createEmptySourcesSection(): SourcesSection {
        return {
            designSources: [],
            simulationSources: [],
            verificationSources: [],
            constraints: [],
            scripts: [],
            ipGenerated: [],
            unassigned: []
        };
    }

    private appendSources(target: SourcesSection, source: SourcesSection): void {
        target.designSources.push(...source.designSources);
        target.simulationSources.push(...source.simulationSources);
        target.verificationSources.push(...source.verificationSources);
        target.constraints.push(...source.constraints);
        target.scripts.push(...source.scripts);
        target.ipGenerated.push(...source.ipGenerated);
        target.unassigned.push(...source.unassigned);
    }

    private buildSourceGroupItems(sources: SourcesSection): HdlTreeItem[] {
        const groups = [
            new SourceGroupItem('Design Sources', sources.designSources, 'symbol-module'),
            new SourceGroupItem('Simulation Sources', sources.simulationSources, 'beaker'),
            new SourceGroupItem('Verification Sources', sources.verificationSources, 'checklist'),
            new SourceGroupItem('Constraints', sources.constraints, 'symbol-key'),
            new SourceGroupItem('Scripts', sources.scripts, 'terminal-powershell'),
            new SourceGroupItem('IP / Generated', sources.ipGenerated, 'package'),
            new SourceGroupItem('Unassigned / Other HDL Files', sources.unassigned, 'question')
        ];

        const showEmptyGroups = vscode.workspace
            .getConfiguration('hdl-helper')
            .get<boolean>('workbench.sources.showEmptyGroups', true);

        if (showEmptyGroups) {
            return groups;
        }

        return groups.filter(group => group.files.length > 0);
    }

    private async findSourceFiles(folder: vscode.WorkspaceFolder): Promise<vscode.Uri[]> {
        const config = vscode.workspace.getConfiguration('hdl-helper', folder.uri);
        const patterns = config.get<string[]>('workbench.sources.includePatterns', [
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
        ]);

        const excludes = config.get<string[]>('workbench.sources.excludePatterns', [
            '**/node_modules/**',
            '**/.git/**',
            '**/.srcs/**',
            '**/.sim/**',
            '**/build/**',
            '**/out/**'
        ]);

        const activePatterns = (patterns || []).filter(Boolean);
        const activeExcludes = (excludes || []).filter(Boolean);
        const excludeGlob = activeExcludes.length > 0 ? `{${activeExcludes.join(',')}}` : undefined;

        const files: vscode.Uri[] = [];
        for (const pattern of activePatterns) {
            const found = await vscode.workspace.findFiles(
                new vscode.RelativePattern(folder, pattern),
                excludeGlob
            );
            files.push(...found);
        }

        return Array.from(new Set(files.map(f => f.fsPath))).map(fsPath => vscode.Uri.file(fsPath));
    }
}