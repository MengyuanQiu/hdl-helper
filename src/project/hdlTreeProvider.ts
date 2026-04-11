import * as vscode from 'vscode';
import { ProjectManager } from './projectManager';
import { HdlModule, HdlInstance } from './hdlSymbol';
import * as path from 'path';
import { ClassificationService } from './classificationService';
import { ProjectConfigService } from './projectConfigService';
import { ExplorerViewModelBuilder } from './explorerViewModelBuilder';
import {
    FileClassificationResult,
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
        this.description = `${files.length}`;
        this.iconPath = new vscode.ThemeIcon(icon);
        this.contextValue = 'sources-group';
    }
}

class SourceFileItem extends vscode.TreeItem {
    constructor(readonly filePath: string) {
        super(path.basename(filePath), vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('file-code');
        this.contextValue = 'sources-file';
        this.resourceUri = vscode.Uri.file(filePath);
        this.command = {
            command: 'vscode.open',
            title: 'Open File',
            arguments: [vscode.Uri.file(filePath)]
        };
    }
}

class LegacyHierarchyRootItem extends vscode.TreeItem {
    constructor() {
        super('Module Hierarchy (Legacy)', vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = new vscode.ThemeIcon('symbol-class');
        this.contextValue = 'legacy-hierarchy-root';
    }
}

type HdlTreeItem =
    | HdlModule
    | HdlInstance
    | HdlInfoItem
    | SourcesRootItem
    | SourceGroupItem
    | SourceFileItem
    | LegacyHierarchyRootItem;

export class HdlTreeProvider implements vscode.TreeDataProvider<HdlTreeItem> {
    // 事件发射器：当数据变化时，通知 VS Code 刷新 UI
    private _onDidChangeTreeData: vscode.EventEmitter<HdlTreeItem | undefined | null | void> = new vscode.EventEmitter<HdlTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<HdlTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    // 当前选中的 Top 模块名
    private topModuleName: string | null = null;

    constructor(private projectManager: ProjectManager) {
    }

    /**
     * 设置 Top Module 并刷新
     */
    public setTopModule(name: string | null) {
        this.topModuleName = name;
        this.refresh(); // 触发刷新
    }

    /**
     * 强制刷新 UI
     */
    refresh(): void {
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
            const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(element.filePath));
            if (folder) {
                item.description = path.relative(folder.uri.fsPath, element.filePath);
            } else {
                item.description = element.filePath;
            }
            return item;
        }

        if (element instanceof LegacyHierarchyRootItem) {
            return element;
        }

        if (element instanceof HdlModule) {
            // ---> 情况 A: 这是一个模块定义 (Module)
            // 无论是根节点还是子节点，它都默认是“可折叠的”
            const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.Collapsed);
            item.description = path.basename(element.fileUri.fsPath); // 灰色文件名
            item.iconPath = new vscode.ThemeIcon('symbol-class'); // 类图标
            item.contextValue = 'module'; // 用于右键菜单判断
            
            // 点击行为：跳转到定义
            item.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [element.fileUri, { selection: element.range }]
            };
            return item;
        } else {
            // ---> 情况 B: 这是一个实例化 (Instance)
            // 显示格式: u_inst : module_type
            const label = `${element.name} : ${element.type}`;
            
            // 🔥 核心逻辑：先去数据库查一下，这个实例化的类型，有没有对应的定义？
            const moduleDef = this.projectManager.getModuleInWorkspace(element.type, element.fileUri);
            const hasChildren = moduleDef !== undefined;
            
            // 如果有定义，就是 Collapsed (有箭头)；如果是黑盒/IP，就是 None (无箭头)
            const state = hasChildren 
                ? vscode.TreeItemCollapsibleState.Collapsed 
                : vscode.TreeItemCollapsibleState.None;

            const item = new vscode.TreeItem(label, state);
            
            item.iconPath = new vscode.ThemeIcon('symbol-field'); // 字段图标
            item.contextValue = 'instance';
            
            // 点击行为：跳转到实例化代码所在行
            item.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [element.fileUri, { selection: element.range }]
            };
            return item;
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
            return element.files.map(file => new SourceFileItem(file.uri));
        }

        if (element instanceof SourceFileItem) {
            return [];
        }

        if (element instanceof LegacyHierarchyRootItem) {
            return this.getLegacyRootChildren();
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