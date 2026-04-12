import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { LintManager } from './linter/LintManager';
import VerilogFormatter from './formatter';
import * as cp from 'child_process';
// 引入原有的功能函数
import { generateTestbench } from './commands/generateTB';
import { instantiateModule } from './commands/instantiateModule';
import { autoDeclareSignals } from './commands/autoDeclare';
import { visualizeFsm } from './commands/generateFsm';
import { generateAxiCommand } from './commands/generateAxi';
import { generateMemoryCommand } from './commands/generateMemory';
import { generateRegistersCommand } from './commands/generateRegisters';
import {
    buildClassificationRenderOptionsByPreset,
    debugProjectClassification,
    inspectProjectClassification,
    inspectProjectClassificationSummary,
    normalizeClassificationInspectorTopFileLimit,
    resolveClassificationDebugPresetArg
} from './commands/debugProjectClassification';
import { debugActiveTargetContext } from './commands/debugActiveTargetContext';
import { debugRecentRunsByTarget } from './commands/debugRecentRuns';
import { openLastWaveformByTarget } from './commands/openLastWaveformByTarget';
import { openLastLogByTarget } from './commands/openLastLogByTarget';
import { openRecentRuns } from './commands/openRecentRuns';
import { openLastRunArtifactsByTarget } from './commands/openLastRunArtifactsByTarget';
import { openRunRecordArtifacts } from './commands/openRunRecordArtifacts';
import { rerunTargetRun, resolveTargetIdFromRerunArg } from './commands/rerunTargetRun';
import { openSimulationTasksFile } from './commands/openSimulationTasksFile';
import { runActiveTargetSimulation } from './commands/runActiveTargetSimulation';
import { debugDualHierarchyState } from './commands/debugDualHierarchyState';
import { openDualHierarchyRegressionChecklist } from './commands/openDualHierarchyRegressionChecklist';
import { openProjectConfigFromWorkspace } from './commands/openProjectConfig';
import { createProjectConfig } from './commands/createProjectConfig';
import { activateLanguageServer, deactivateLanguageServer } from './languageClient';
// 引入 V2.0 工程核心
import { ProjectManager } from './project/projectManager';
import { HdlTreeProvider } from './project/hdlTreeProvider';
import { StateChangeEvent, StateService } from './project/stateService';
import { HierarchyService } from './project/hierarchyService';
import { ProjectConfigService } from './project/projectConfigService';
import { TargetContextService } from './project/targetContextService';
import { mapLegacyTopSelection } from './project/topSelectionPolicy';
import { HdlModule } from './project/hdlSymbol';
import { VerilogDefinitionProvider } from './providers/defProvider';
import { VerilogHoverProvider } from './providers/hoverProvider';
import { VerilogOutlineProvider } from './providers/outlineProvider';
import { VerilogReferenceProvider } from './providers/referenceProvider';
import { VerilogRenameProvider } from './providers/renameProvider';
import { VerilogCompletionProvider } from './providers/completionProvider';
import { HdlSimTask, SimManager } from './simulation/simManager';
import { resolveActiveTargetIdFromRuns, writeRunRecordForTarget } from './simulation/runsService';
import { WaveformViewer } from './simulation/waveformViewer';
import { VivadoBridge } from './eda/vivadoBridge';
import { XdcCompletionProvider } from './providers/xdcCompletionProvider';
import { CodeGenerator } from './utils/codeGenerator';
import { DocGenerator } from './utils/docGenerator';
import { IpCatalogProvider } from './providers/ipCatalogProvider';
import { HdlCodeActionProvider } from './providers/codeActionProvider';


// 全局变量，方便 deactivate 使用
let projectManager: ProjectManager;
const hierarchyService = new HierarchyService();

function resolveWorkspaceForContext(sourceUri?: vscode.Uri): vscode.WorkspaceFolder | undefined {
    if (sourceUri) {
        const fromSource = vscode.workspace.getWorkspaceFolder(sourceUri);
        if (fromSource) {
            return fromSource;
        }
    }

    const activeUri = vscode.window.activeTextEditor?.document.uri;
    if (activeUri) {
        const fromActive = vscode.workspace.getWorkspaceFolder(activeUri);
        if (fromActive) {
            return fromActive;
        }
    }

    return vscode.workspace.workspaceFolders?.[0];
}

function resolveSourceItemUri(item?: unknown): vscode.Uri | undefined {
    if (!item || typeof item !== 'object') {
        return undefined;
    }

    const candidate = item as {
        resourceUri?: vscode.Uri;
        file?: { uri?: string };
    };

    if (candidate.resourceUri instanceof vscode.Uri) {
        return candidate.resourceUri;
    }

    if (candidate.file?.uri) {
        return vscode.Uri.file(candidate.file.uri);
    }

    return undefined;
}

function findLatestWaveformInBuild(buildDir: string): string | undefined {
    if (!fs.existsSync(buildDir)) {
        return undefined;
    }

    const candidates = fs.readdirSync(buildDir, { withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => path.join(buildDir, entry.name))
        .filter(filePath => {
            const ext = path.extname(filePath).toLowerCase();
            return ext === '.fst' || ext === '.vcd';
        })
        .map(filePath => ({ filePath, mtime: fs.statSync(filePath).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);

    return candidates[0]?.filePath;
}

function isLikelyTestbench(mod: HdlModule): boolean {
    return hierarchyService.isLikelyTestbench(mod);
}

async function pickModuleFromHierarchy(projectManager: ProjectManager, actionLabel: string): Promise<HdlModule | undefined> {
    const modules = projectManager.getAllModules();
    if (modules.length === 0) {
        vscode.window.showWarningMessage('No modules available in Module Hierarchy. Please rescan project first.');
        return undefined;
    }

    const sorted = [...modules].sort((a, b) => {
        const aTb = isLikelyTestbench(a) ? 0 : 1;
        const bTb = isLikelyTestbench(b) ? 0 : 1;
        if (aTb !== bTb) {
            return aTb - bTb;
        }
        return a.name.localeCompare(b.name);
    });

    const picked = await vscode.window.showQuickPick(
        sorted.map(mod => ({
            label: mod.name,
            description: path.basename(mod.fileUri.fsPath),
            detail: isLikelyTestbench(mod) ? 'Likely testbench module' : 'Design module',
            module: mod
        })),
        { placeHolder: `Select module to ${actionLabel}` }
    );

    return picked?.module;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('HDL Helper is active!');

    // =========================================================================
    // 1. 核心初始化 (顺序很重要！)
    // =========================================================================
    
    // A. 初始化工程管理器（先于 LintManager，供 VerilatorEngine 查询工程目录）
    const logChannel = vscode.window.createOutputChannel('HDL Helper AST');
    projectManager = new ProjectManager(context.extensionUri, logChannel);

    // A2. 在后台异步初始化 Tree-sitter AST 引擎（不阻塞主流程）
    projectManager.initAstParser();
    projectManager.scanWorkspace(); // 启动后台扫描

    const scanStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    scanStatusItem.command = 'hdl-helper.refreshProject';
    const updateScanStatus = () => {
        if (projectManager.isScanning()) {
            scanStatusItem.text = '$(sync~spin) HDL scanning...';
            scanStatusItem.tooltip = 'HDL Helper is scanning workspace files';
        } else {
            const summary = projectManager.getLastScanSummary();
            if (summary.moduleCount > 0) {
                scanStatusItem.text = `$(symbol-class) HDL ${summary.moduleCount} modules`;
                scanStatusItem.tooltip = `Scanned ${summary.fileCount} file(s). Click to rescan.`;
            } else {
                scanStatusItem.text = '$(warning) HDL no modules';
                scanStatusItem.tooltip = 'No HDL modules found. Click to rescan project.';
            }
        }
        scanStatusItem.show();
    };
    context.subscriptions.push(scanStatusItem);
    context.subscriptions.push(projectManager.onDidChangeScanState(() => updateScanStatus()));
    updateScanStatus();

    // B. 启动多引擎 Linter，传入 projectManager（供 Verilator 注入 Include 路径）
    const lintManager = new LintManager(projectManager);
    lintManager.activate(context.subscriptions);


    // C. 初始化 Tree Provider
    const stateService = new StateService(context);
    const treeProvider = new HdlTreeProvider(
        projectManager,
        () => stateService.getAllRunRecords(),
        async () => {
            const workspaceFolder = resolveWorkspaceForContext();
            if (!workspaceFolder) {
                return [];
            }

            const tasks = await SimManager.getTasks(workspaceFolder.uri);
            return tasks.map(task => ({
                name: task.name,
                top: task.top,
                tool: task.tool
            }));
        },
        async () => {
            const workspaceFolder = resolveWorkspaceForContext();
            return resolveActiveTargetIdFromRuns(
                stateService,
                stateService.getAllRunRecords(),
                workspaceFolder
            );
        }
    );
    const ipCatalogProvider = new IpCatalogProvider();
    context.subscriptions.push(stateService);

    // Restore persisted dual-hierarchy tops at startup.
    treeProvider.setDesignTopModule(stateService.getDesignTop() ?? null);
    treeProvider.setSimulationTopModule(stateService.getSimulationTop() ?? null);

    // D. 注册侧边栏视图
    vscode.window.registerTreeDataProvider(
        'hdl-hierarchy-view', 
        treeProvider
    );
    vscode.window.registerTreeDataProvider(
        'ip-explorer-view',
        ipCatalogProvider
    );

    // Keep explorer rendering in sync with Day 3 feature-flag toggles.
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
        if (
            event.affectsConfiguration('hdl-helper.workbench.roleGroupedSources') ||
            event.affectsConfiguration('hdl-helper.projectConfig.enabled') ||
            event.affectsConfiguration('hdl-helper.targetDrivenRuns.enabled') ||
            event.affectsConfiguration('hdl-helper.workbench.dualHierarchy') ||
            event.affectsConfiguration('hdl-helper.simulation.tasksFile') ||
            event.affectsConfiguration('hdl-helper.workbench.sources.includePatterns') ||
            event.affectsConfiguration('hdl-helper.workbench.sources.excludePatterns') ||
            event.affectsConfiguration('hdl-helper.workbench.sources.showEmptyGroups') ||
            event.affectsConfiguration('hdl-helper.workbench.sources.showLegacyHierarchy') ||
            event.affectsConfiguration('hdl-helper.workbench.heuristic.defaultHdlRole')
        ) {
            treeProvider.refresh();
        }
    }));

    context.subscriptions.push(stateService.onStateChange(event => {
        if (event === StateChangeEvent.RunRecorded) {
            treeProvider.refresh();
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.refreshIpExplorer', () => {
        ipCatalogProvider.refresh();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.quickStart', async () => {
        const action = await vscode.window.showQuickPick([
            {
                label: 'Instantiate Module',
                description: 'Insert instantiation template from project modules',
                detail: 'Core workflow'
            },
            {
                label: 'Create Signal Declarations',
                description: 'Generate signal declarations from selected instance',
                detail: 'Core workflow'
            },
            {
                label: 'Format Current File',
                description: 'Run Verible formatter on active HDL document',
                detail: 'Core workflow'
            },
            {
                label: 'Rescan Project',
                description: 'Rebuild module index for explorer and completion',
                detail: 'Core workflow'
            },
            {
                label: 'Open HDL Helper Settings',
                description: 'Open extension settings (linter/formatter/project)',
                detail: 'Configuration'
            },
            {
                label: 'Open Simulation Settings',
                description: 'Configure simulator path, build dir, and task file',
                detail: 'Configuration'
            },
            {
                label: 'Open Simulation Tasks File',
                description: 'Open or create configured hdl_tasks.json file',
                detail: 'Configuration'
            },
            {
                label: 'Open Workbench Settings',
                description: 'Configure explorer grouping, source scan filters, and fallback behavior',
                detail: 'Configuration'
            },
            {
                label: 'Open Workbench Settings Guide',
                description: 'Open docs/WORKBENCH_SETTINGS_GUIDE.md in editor',
                detail: 'Documentation'
            },
            {
                label: 'Configure Classification Inspector Top-File Limit',
                description: 'Set max entries shown in summary top-file preview',
                detail: 'Configuration'
            },
            {
                label: 'Debug Dual Hierarchy State',
                description: 'Print current dual-hierarchy roots/tops/flags to output channel',
                detail: 'Diagnostics'
            },
            {
                label: 'Debug Active Target Context',
                description: 'Print active target resolution and fallback diagnostics',
                detail: 'Diagnostics'
            },
            {
                label: 'Debug Recent Runs By Target',
                description: 'Print target-keyed run history from workspace state',
                detail: 'Diagnostics'
            },
            {
                label: 'Debug Project Classification (View...)',
                description: 'Run classification debug with preset view (all/overview/details)',
                detail: 'Diagnostics'
            },
            {
                label: 'Inspect Project Classification (Pick File)',
                description: 'Inspect one classified file with interactive picker',
                detail: 'Diagnostics'
            },
            {
                label: 'Inspect Project Classification Summary',
                description: 'Inspect aggregated classification counters by scope',
                detail: 'Diagnostics'
            },
            {
                label: 'Inspect Project Classification Summary (Active)',
                description: 'Inspect aggregated counters for active-target files',
                detail: 'Diagnostics'
            },
            {
                label: 'Inspect Project Classification Summary (Shared)',
                description: 'Inspect aggregated counters for shared files',
                detail: 'Diagnostics'
            },
            {
                label: 'Inspect Project Classification Summary (Project Config)',
                description: 'Inspect aggregated counters for project-config files',
                detail: 'Diagnostics'
            },
            {
                label: 'Inspect Project Classification Summary (Heuristic)',
                description: 'Inspect aggregated counters for heuristic files',
                detail: 'Diagnostics'
            },
            {
                label: 'Inspect Project Classification (Active Files)',
                description: 'Inspect files scoped to active target context',
                detail: 'Diagnostics'
            },
            {
                label: 'Inspect Project Classification (Shared Files)',
                description: 'Inspect files referenced by multiple source roles',
                detail: 'Diagnostics'
            },
            {
                label: 'Debug Project Classification (All)',
                description: 'Run classification debug with all sections preset',
                detail: 'Diagnostics'
            },
            {
                label: 'Debug Project Classification (Overview)',
                description: 'Run classification debug with overview preset',
                detail: 'Diagnostics'
            },
            {
                label: 'Debug Project Classification (Details)',
                description: 'Run classification debug with details-only preset',
                detail: 'Diagnostics'
            },
            {
                label: 'Open Dual Hierarchy Regression Checklist',
                description: 'Open resources/regression/DUAL_HIERARCHY_MANUAL_REGRESSION.md',
                detail: 'Diagnostics'
            },
            {
                label: 'Create Project Config',
                description: 'Generate .hdl-helper/project.json template from workspace',
                detail: 'Configuration'
            },
            {
                label: 'Open Project Config',
                description: 'Open .hdl-helper/project.json or create when missing',
                detail: 'Configuration'
            },
            {
                label: 'Open Last Waveform (Active Target)',
                description: 'Open latest waveform from target-keyed run record',
                detail: 'Diagnostics'
            },
            {
                label: 'Open Last Log (Active Target)',
                description: 'Open latest simulation log from target-keyed run record',
                detail: 'Diagnostics'
            },
            {
                label: 'Open Recent Runs',
                description: 'Browse target-keyed run history and open waveform/log',
                detail: 'Diagnostics'
            },
            {
                label: 'Open Last Run Artifacts (Active Target)',
                description: 'One-click reopen waveform/log for the active target run',
                detail: 'Diagnostics'
            },
            {
                label: 'Rerun Active Target',
                description: 'Run simulation again for active target run record',
                detail: 'Action'
            },
            {
                label: 'Run Active Target Simulation',
                description: 'Resolve active target top and run simulation',
                detail: 'Action'
            },
            {
                label: 'Open Run Record Artifacts',
                description: 'Open waveform/log for a selected target record',
                detail: 'Diagnostics'
            },
        ], {
            placeHolder: 'HDL Helper Quick Actions'
        });

        if (!action) {
            return;
        }

        if (action.label === 'Instantiate Module') {
            await vscode.commands.executeCommand('hdl-helper.instantiate');
            return;
        }
        if (action.label === 'Create Signal Declarations') {
            await vscode.commands.executeCommand('hdl-helper.createSignals');
            return;
        }
        if (action.label === 'Format Current File') {
            await vscode.commands.executeCommand('editor.action.formatDocument');
            return;
        }
        if (action.label === 'Rescan Project') {
            await vscode.commands.executeCommand('hdl-helper.refreshProject');
            return;
        }
        if (action.label === 'Open HDL Helper Settings') {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'hdl-helper');
            return;
        }
        if (action.label === 'Open Simulation Settings') {
            await vscode.commands.executeCommand('hdl-helper.openSimulationSettings');
            return;
        }
        if (action.label === 'Open Simulation Tasks File') {
            await vscode.commands.executeCommand('hdl-helper.openSimulationTasksFile');
            return;
        }
        if (action.label === 'Open Workbench Settings') {
            await vscode.commands.executeCommand('hdl-helper.openWorkbenchSettings');
            return;
        }
        if (action.label === 'Open Workbench Settings Guide') {
            await vscode.commands.executeCommand('hdl-helper.openWorkbenchSettingsGuide');
            return;
        }
        if (action.label === 'Configure Classification Inspector Top-File Limit') {
            await vscode.commands.executeCommand('hdl-helper.configureClassificationInspectorTopFileLimit');
            return;
        }
        if (action.label === 'Debug Dual Hierarchy State') {
            await vscode.commands.executeCommand('hdl-helper.debugDualHierarchyState');
            return;
        }
        if (action.label === 'Debug Active Target Context') {
            await vscode.commands.executeCommand('hdl-helper.debugActiveTargetContext');
            return;
        }
        if (action.label === 'Debug Recent Runs By Target') {
            await vscode.commands.executeCommand('hdl-helper.debugRecentRunsByTarget');
            return;
        }
        if (action.label === 'Debug Project Classification (View...)') {
            await vscode.commands.executeCommand('hdl-helper.debugProjectClassificationView');
            return;
        }
        if (action.label === 'Inspect Project Classification (Pick File)') {
            await vscode.commands.executeCommand('hdl-helper.inspectProjectClassification');
            return;
        }
        if (action.label === 'Inspect Project Classification Summary') {
            await vscode.commands.executeCommand('hdl-helper.inspectProjectClassificationSummary');
            return;
        }
        if (action.label === 'Inspect Project Classification Summary (Active)') {
            await vscode.commands.executeCommand('hdl-helper.inspectProjectClassificationSummaryActive');
            return;
        }
        if (action.label === 'Inspect Project Classification Summary (Shared)') {
            await vscode.commands.executeCommand('hdl-helper.inspectProjectClassificationSummaryShared');
            return;
        }
        if (action.label === 'Inspect Project Classification Summary (Project Config)') {
            await vscode.commands.executeCommand('hdl-helper.inspectProjectClassificationSummaryProjectConfig');
            return;
        }
        if (action.label === 'Inspect Project Classification Summary (Heuristic)') {
            await vscode.commands.executeCommand('hdl-helper.inspectProjectClassificationSummaryHeuristic');
            return;
        }
        if (action.label === 'Inspect Project Classification (Active Files)') {
            await vscode.commands.executeCommand('hdl-helper.inspectProjectClassification', 'active');
            return;
        }
        if (action.label === 'Inspect Project Classification (Shared Files)') {
            await vscode.commands.executeCommand('hdl-helper.inspectProjectClassification', 'shared');
            return;
        }
        if (action.label === 'Debug Project Classification (All)') {
            await vscode.commands.executeCommand('hdl-helper.debugProjectClassificationAll');
            return;
        }
        if (action.label === 'Debug Project Classification (Overview)') {
            await vscode.commands.executeCommand('hdl-helper.debugProjectClassificationOverview');
            return;
        }
        if (action.label === 'Debug Project Classification (Details)') {
            await vscode.commands.executeCommand('hdl-helper.debugProjectClassificationDetails');
            return;
        }
        if (action.label === 'Open Dual Hierarchy Regression Checklist') {
            await vscode.commands.executeCommand('hdl-helper.openDualHierarchyRegressionChecklist');
            return;
        }
        if (action.label === 'Create Project Config') {
            await vscode.commands.executeCommand('hdl-helper.createProjectConfig');
            return;
        }
        if (action.label === 'Open Project Config') {
            await vscode.commands.executeCommand('hdl-helper.openProjectConfig');
            return;
        }
        if (action.label === 'Open Last Waveform (Active Target)') {
            await vscode.commands.executeCommand('hdl-helper.openLastWaveformByTarget');
            return;
        }
        if (action.label === 'Open Last Log (Active Target)') {
            await vscode.commands.executeCommand('hdl-helper.openLastLogByTarget');
            return;
        }
        if (action.label === 'Open Recent Runs') {
            await vscode.commands.executeCommand('hdl-helper.openRecentRuns');
            return;
        }
        if (action.label === 'Open Last Run Artifacts (Active Target)') {
            await vscode.commands.executeCommand('hdl-helper.openLastRunArtifactsByTarget');
            return;
        }
        if (action.label === 'Rerun Active Target') {
            await vscode.commands.executeCommand('hdl-helper.rerunTargetRun');
            return;
        }
        if (action.label === 'Run Active Target Simulation') {
            await vscode.commands.executeCommand('hdl-helper.runActiveTargetSimulation');
            return;
        }
        if (action.label === 'Open Run Record Artifacts') {
            await vscode.commands.executeCommand('hdl-helper.openRecentRuns');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.openHierarchyTools', async () => {
        const picked = await vscode.window.showQuickPick([
            {
                label: '[Settings] Workbench Settings',
                description: 'Open explorer/workbench settings',
                command: 'hdl-helper.openWorkbenchSettings'
            },
            {
                label: '[Settings] Simulation Settings',
                description: 'Open simulation task/path settings',
                command: 'hdl-helper.openSimulationSettings'
            },
            {
                label: '[Settings] Simulation Tasks File',
                description: 'Open or create configured hdl_tasks.json',
                command: 'hdl-helper.openSimulationTasksFile'
            },
            {
                label: '[Settings] Workbench Settings Guide',
                description: 'Open docs/WORKBENCH_SETTINGS_GUIDE.md',
                command: 'hdl-helper.openWorkbenchSettingsGuide'
            },
            {
                label: '[Settings] Configure Classification Inspector Top-File Limit',
                description: 'Set max entries shown in summary top-file preview',
                command: 'hdl-helper.configureClassificationInspectorTopFileLimit'
            },
            {
                label: '[Diagnostics] Debug Dual Hierarchy State',
                description: 'Print roots/tops/flags to output channel',
                command: 'hdl-helper.debugDualHierarchyState'
            },
            {
                label: '[Diagnostics] Debug Active Target Context',
                description: 'Print active target context and fallback path',
                command: 'hdl-helper.debugActiveTargetContext'
            },
            {
                label: '[Diagnostics] Debug Recent Runs By Target',
                description: 'Print target-keyed run history from workspace state',
                command: 'hdl-helper.debugRecentRunsByTarget'
            },
            {
                label: '[Diagnostics] Debug Project Classification (View...)',
                description: 'Run classification debug with all/overview/details preset',
                command: 'hdl-helper.debugProjectClassificationView'
            },
            {
                label: '[Diagnostics] Inspect Project Classification (Pick File)',
                description: 'Inspect one classified file with interactive picker',
                command: 'hdl-helper.inspectProjectClassification'
            },
            {
                label: '[Diagnostics] Inspect Project Classification Summary',
                description: 'Inspect aggregated classification counters by scope',
                command: 'hdl-helper.inspectProjectClassificationSummary'
            },
            {
                label: '[Diagnostics] Inspect Project Classification Summary (Active)',
                description: 'Inspect aggregated counters for active-target files',
                command: 'hdl-helper.inspectProjectClassificationSummaryActive'
            },
            {
                label: '[Diagnostics] Inspect Project Classification Summary (Shared)',
                description: 'Inspect aggregated counters for shared files',
                command: 'hdl-helper.inspectProjectClassificationSummaryShared'
            },
            {
                label: '[Diagnostics] Inspect Project Classification Summary (Project Config)',
                description: 'Inspect aggregated counters for project-config files',
                command: 'hdl-helper.inspectProjectClassificationSummaryProjectConfig'
            },
            {
                label: '[Diagnostics] Inspect Project Classification Summary (Heuristic)',
                description: 'Inspect aggregated counters for heuristic files',
                command: 'hdl-helper.inspectProjectClassificationSummaryHeuristic'
            },
            {
                label: '[Diagnostics] Inspect Project Classification (Active Files)',
                description: 'Inspect files scoped to active target context',
                command: 'hdl-helper.inspectProjectClassification',
                args: 'active'
            },
            {
                label: '[Diagnostics] Inspect Project Classification (Shared Files)',
                description: 'Inspect files referenced by multiple source roles',
                command: 'hdl-helper.inspectProjectClassification',
                args: 'shared'
            },
            {
                label: '[Diagnostics] Debug Project Classification (All)',
                description: 'Run classification debug with all sections preset',
                command: 'hdl-helper.debugProjectClassificationAll'
            },
            {
                label: '[Diagnostics] Debug Project Classification (Overview)',
                description: 'Run classification debug with overview preset',
                command: 'hdl-helper.debugProjectClassificationOverview'
            },
            {
                label: '[Diagnostics] Debug Project Classification (Details)',
                description: 'Run classification debug with details-only preset',
                command: 'hdl-helper.debugProjectClassificationDetails'
            },
            {
                label: '[Diagnostics] Dual Hierarchy Regression Checklist',
                description: 'Open manual regression checklist',
                command: 'hdl-helper.openDualHierarchyRegressionChecklist'
            },
            {
                label: '[Action] Clear Top Module',
                description: 'Clear design/simulation/legacy top selection',
                command: 'hdl-helper.clearTopModule'
            },
            {
                label: '[Action] Create Project Config',
                description: 'Generate .hdl-helper/project.json template',
                command: 'hdl-helper.createProjectConfig'
            },
            {
                label: '[Action] Open Project Config',
                description: 'Open existing config or create template',
                command: 'hdl-helper.openProjectConfig'
            },
            {
                label: '[Action] Open Last Waveform (Active Target)',
                description: 'Open latest waveform from target-keyed run record',
                command: 'hdl-helper.openLastWaveformByTarget'
            },
            {
                label: '[Action] Open Last Log (Active Target)',
                description: 'Open latest simulation log from target-keyed run record',
                command: 'hdl-helper.openLastLogByTarget'
            },
            {
                label: '[Action] Open Recent Runs',
                description: 'Browse target-keyed run history and open waveform/log',
                command: 'hdl-helper.openRecentRuns'
            },
            {
                label: '[Action] Open Last Run Artifacts (Active Target)',
                description: 'One-click reopen waveform/log for the active target run',
                command: 'hdl-helper.openLastRunArtifactsByTarget'
            },
            {
                label: '[Action] Rerun Active Target',
                description: 'Run simulation again for active target run record',
                command: 'hdl-helper.rerunTargetRun'
            },
            {
                label: '[Action] Run Active Target Simulation',
                description: 'Resolve active target top and run simulation',
                command: 'hdl-helper.runActiveTargetSimulation'
            }
        ], {
            placeHolder: 'Hierarchy Tools (Settings / Diagnostics / Action)'
        });

        if (!picked) {
            return;
        }

        await vscode.commands.executeCommand(picked.command, picked.args);
    }));

    // =========================================================================
    // 2. 注册 Formatter (格式化)
    // =========================================================================
    const formatter = new VerilogFormatter();
    const formatProvider = vscode.languages.registerDocumentFormattingEditProvider(
        ['verilog', 'systemverilog'],
        formatter
    );
    context.subscriptions.push(formatProvider);

    // =========================================================================
    // 3. 注册功能命令 (Commands)
    // =========================================================================

    // --- A. 生成 Testbench (升级版：支持右键菜单) ---
    // 逻辑：如果是右键树节点触发的，先打开那个文件，再调用原来的生成逻辑
    const genTBCmd = vscode.commands.registerCommand('hdl-helper.generateTB', async (item?: HdlModule) => {
        try { 
            if (item && item.fileUri) {
                // 如果是从树形菜单点击的，先打开该文件
                await vscode.window.showTextDocument(item.fileUri);
            }
            // 复用之前的逻辑
            await generateTestbench(); 
        } catch (e) { 
            vscode.window.showErrorMessage(`TB 生成失败: ${e}`); 
        }
    });
    context.subscriptions.push(genTBCmd);

    // --- B. 智能例化 (Ctrl+Alt+I) ---
    const instCmd = vscode.commands.registerCommand('hdl-helper.instantiate', async () => {
        try { await instantiateModule(projectManager); } catch (e) { vscode.window.showErrorMessage(`${e}`); }
    });
    context.subscriptions.push(instCmd);

    // --- C. 自动声明信号 (Ctrl+Alt+W) ---
    const autoWireCmd = vscode.commands.registerCommand('hdl-helper.createSignals', async () => {
        try { await autoDeclareSignals(); } catch (e) { vscode.window.showErrorMessage(`${e}`); }
    });
    context.subscriptions.push(autoWireCmd);

    // --- C.5 状态机可视化 (FSM Visualization) ---
    const fsmCmd = vscode.commands.registerCommand('hdl-helper.generateFsm', async () => {
        try { await visualizeFsm(); } catch (e) { vscode.window.showErrorMessage(`${e}`); }
    });
    context.subscriptions.push(fsmCmd);

    // --- Phase 10: Advanced Code Generators ---
    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.generateAxi', async () => {
        try { await generateAxiCommand(); } catch (e) { vscode.window.showErrorMessage(`${e}`); }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.generateMemory', async () => {
        try { await generateMemoryCommand(); } catch (e) { vscode.window.showErrorMessage(`${e}`); }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.generateRegisters', async () => {
        try { await generateRegistersCommand(); } catch (e) { vscode.window.showErrorMessage(`${e}`); }
    }));

    // D. 复制实例化模板 (树节点右键)
    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.copyInstantiation', async (item: HdlModule) => {
        if (!item || !(item instanceof HdlModule)) {
            return;
        }

        // 调用统一生成器 (这里可以选择不带注释，保持清爽，或者设为 true 也带注释)
        const finalCode = CodeGenerator.generateInstantiation(item, false);

        await vscode.env.clipboard.writeText(finalCode);
        vscode.window.showInformationMessage(`已复制 ${item.name} 实例化模板！`);
    }));

    // --- E. 工程管理命令 (Set/Clear Top) ---
    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.setTopModule', async (item: HdlModule) => {
        if (item && item.name) {
            treeProvider.setTopModule(item.name);

            const mapping = mapLegacyTopSelection(item, hierarchyService);
            if (mapping.simulationTop) {
                treeProvider.setSimulationTopModule(mapping.simulationTop);
                await stateService.setSimulationTop(mapping.simulationTop);
                vscode.window.showInformationMessage(`Top Module set to: ${item.name} (mapped to Simulation Top)`);
            } else {
                treeProvider.setDesignTopModule(mapping.designTop!);
                await stateService.setDesignTop(mapping.designTop!);
                vscode.window.showInformationMessage(`Top Module set to: ${item.name} (mapped to Design Top)`);
            }
        } else {
            vscode.window.showErrorMessage("只能将模块定义设为 Top");
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.setDesignTopModule', async (item: HdlModule) => {
        if (item && item.name) {
            treeProvider.setDesignTopModule(item.name);
            await stateService.setDesignTop(item.name);
            vscode.window.showInformationMessage(`Design Top set to: ${item.name}`);
            return;
        }

        vscode.window.showErrorMessage('Can only set a module definition as Design Top.');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.setSimulationTopModule', async (item: HdlModule) => {
        if (item && item.name) {
            treeProvider.setSimulationTopModule(item.name);
            await stateService.setSimulationTop(item.name);
            vscode.window.showInformationMessage(`Simulation Top set to: ${item.name}`);
            return;
        }

        vscode.window.showErrorMessage('Can only set a module definition as Simulation Top.');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.clearTopModule', async () => {
        treeProvider.setTopModule(null);
        treeProvider.clearScopedTops();
        await stateService.setDesignTop(undefined);
        await stateService.setSimulationTop(undefined);
        vscode.window.showInformationMessage(`已清除 Top Module 设置`);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.openSourceFile', async (item?: unknown) => {
        const uri = resolveSourceItemUri(item);
        if (!uri) {
            vscode.window.showWarningMessage('No source file selected.');
            return;
        }

        await vscode.window.showTextDocument(uri, { preview: false });
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.revealSourceFileInExplorer', async (item?: unknown) => {
        const uri = resolveSourceItemUri(item);
        if (!uri) {
            vscode.window.showWarningMessage('No source file selected.');
            return;
        }

        await vscode.commands.executeCommand('revealInExplorer', uri);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.refreshProject', async () => {
        await projectManager.scanWorkspace();
        treeProvider.refresh();
    }));

    // =========================================================================
    // 5. 注册跳转定义 (Go to Definition)
    // =========================================================================
    const defProvider = new VerilogDefinitionProvider(projectManager);
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(
            ['verilog', 'systemverilog'],
            defProvider
        )
    );

    // =========================================================================
    // 6. 注册悬停提示 (Hover) 与 文档大纲 (Document Symbol)
    // =========================================================================
    const hoverProvider = new VerilogHoverProvider(projectManager);
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            ['verilog', 'systemverilog'],
            hoverProvider
        )
    );

    const outlineProvider = new VerilogOutlineProvider(projectManager);
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            ['verilog', 'systemverilog'],
            outlineProvider
        )
    );

    const referenceProvider = new VerilogReferenceProvider(projectManager);
    context.subscriptions.push(
        vscode.languages.registerReferenceProvider(
            ['verilog', 'systemverilog'],
            referenceProvider
        )
    );

    const renameProvider = new VerilogRenameProvider(projectManager);
    context.subscriptions.push(
        vscode.languages.registerRenameProvider(
            ['verilog', 'systemverilog'],
            renameProvider
        )
    );

    const completionProvider = new VerilogCompletionProvider(projectManager);
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            ['verilog', 'systemverilog'],
            completionProvider,
            '.', // trigger character
            '`'  // optional trigger character for macros
        )
    );
    // =========================================================================
    // 7. 注册 Quick Fix (Code Actions)
    // =========================================================================
    const codeActionProvider = new HdlCodeActionProvider();
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            ['verilog', 'systemverilog'],
            codeActionProvider,
            {
                providedCodeActionKinds: HdlCodeActionProvider.providedCodeActionKinds
            }
        )
    );

    // =========================================================================
    // 7. 注册仿真命令 (Phase 6)
    // =========================================================================

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.runSimulationFromHierarchy', async (item?: HdlModule) => {
        const targetModule = item instanceof HdlModule
            ? item
            : await pickModuleFromHierarchy(projectManager, 'run simulation');

        if (!targetModule) {
            return;
        }

        await vscode.commands.executeCommand('hdl-helper.runSimulation', targetModule.name, targetModule.fileUri);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.runSimulationTaskItem', async (arg?: unknown) => {
        let top = typeof arg === 'string'
            ? arg
            : (arg && typeof arg === 'object' && 'top' in (arg as Record<string, unknown>))
                ? String((arg as Record<string, unknown>).top)
                : undefined;

        if (!top && arg && typeof arg === 'object' && 'task' in (arg as Record<string, unknown>)) {
            const taskValue = (arg as Record<string, unknown>).task;
            if (taskValue && typeof taskValue === 'object' && 'top' in (taskValue as Record<string, unknown>)) {
                top = String((taskValue as Record<string, unknown>).top);
            }
        }

        if (!top) {
            vscode.window.showWarningMessage('No simulation top found for selected task item.');
            return;
        }

        await vscode.commands.executeCommand('hdl-helper.runSimulation', top);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.viewWaveformFromHierarchy', async (item?: HdlModule) => {
        const targetModule = item instanceof HdlModule
            ? item
            : await pickModuleFromHierarchy(projectManager, 'view waveform');

        if (!targetModule) {
            return;
        }

        await vscode.commands.executeCommand('hdl-helper.viewWaveform', targetModule.name, targetModule.fileUri);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.openSimulationSettings', async () => {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'hdl-helper.simulation');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.openSimulationTasksFile', async () => {
        const workspaceFolder = resolveWorkspaceForContext();
        const configuredTasksFile = workspaceFolder
            ? vscode.workspace.getConfiguration('hdl-helper', workspaceFolder.uri).get<string>('simulation.tasksFile')
            : undefined;

        await openSimulationTasksFile({
            workspaceRoot: workspaceFolder?.uri.fsPath,
            configuredTasksFile
        });
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.openWorkbenchSettings', async () => {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'hdl-helper.workbench');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.openWorkbenchSettingsGuide', async () => {
        const workspaceFolder = resolveWorkspaceForContext();
        const guidePath = workspaceFolder
            ? path.join(workspaceFolder.uri.fsPath, 'docs', 'WORKBENCH_SETTINGS_GUIDE.md')
            : '';

        if (guidePath && fs.existsSync(guidePath)) {
            const guideUri = vscode.Uri.file(guidePath);
            await vscode.window.showTextDocument(guideUri, { preview: false });
            return;
        }

        await vscode.commands.executeCommand('workbench.action.openSettings', 'hdl-helper.workbench');
        vscode.window.showWarningMessage('WORKBENCH_SETTINGS_GUIDE.md not found. Opened Workbench settings instead.');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.openDualHierarchyRegressionChecklist', async () => {
        const workspaceFolder = resolveWorkspaceForContext();
        await openDualHierarchyRegressionChecklist({
            workspaceRoot: workspaceFolder?.uri.fsPath,
            existsSync: fs.existsSync,
            openChecklist: async (filePath: string) => {
                await vscode.window.showTextDocument(vscode.Uri.file(filePath), { preview: false });
            },
            runFallbackDebug: async () => {
                await vscode.commands.executeCommand('hdl-helper.debugDualHierarchyState');
            },
            showWarning: (message: string) => {
                vscode.window.showWarningMessage(message);
            }
        });
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.createProjectConfig', async () => {
        await createProjectConfig(projectManager);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.openProjectConfig', async () => {
        await openProjectConfigFromWorkspace(async () => createProjectConfig(projectManager));
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.openLastWaveformByTarget', async () => {
        await openLastWaveformByTarget(stateService);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.openLastLogByTarget', async () => {
        await openLastLogByTarget(stateService);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.openRecentRuns', async () => {
        await openRecentRuns(stateService);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.openLastRunArtifactsByTarget', async () => {
        await openLastRunArtifactsByTarget(stateService);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.openRunRecordArtifacts', async (targetId: string) => {
        if (!targetId || typeof targetId !== 'string') {
            return;
        }
        await openRunRecordArtifacts(stateService, targetId);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.rerunTargetRun', async (arg?: unknown) => {
        const targetId = resolveTargetIdFromRerunArg(arg);
        await rerunTargetRun(stateService, targetId);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.runActiveTargetSimulation', async () => {
        await runActiveTargetSimulation(stateService, projectManager);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.runSimulation', async (moduleName: string, sourceUri?: vscode.Uri) => {
        if (!moduleName || typeof moduleName !== 'string') {
            vscode.window.showErrorMessage('No module selected for simulation.');
            return;
        }

        const workspaceFolder = resolveWorkspaceForContext(sourceUri);
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open for simulation.');
            return;
        }

        const matchedTasks = await SimManager.getTasksForTop(moduleName, projectManager, workspaceFolder.uri);
        let task: HdlSimTask;
        if (matchedTasks.length > 1) {
            const picked = await vscode.window.showQuickPick(
                matchedTasks.map(t => ({
                    label: t.name,
                    description: `tool=${t.tool}, top=${t.top}`,
                    detail: t.filelist
                        ? `filelist: ${Array.isArray(t.filelist) ? t.filelist.join(', ') : t.filelist}`
                        : `sources: ${(t.sources || []).join(', ') || '(auto)'}`,
                    task: t
                })),
                {
                    placeHolder: `Select simulation task for ${moduleName}`
                }
            );

            if (!picked) {
                return;
            }
            task = picked.task;
        } else if (matchedTasks.length === 1) {
            task = matchedTasks[0];
        } else {
            task = await SimManager.getDefaultTaskForModule(moduleName, projectManager, workspaceFolder.uri);
        }
        
        // 执行任务
        const runResult = await SimManager.runTask(task, projectManager, workspaceFolder.uri);

        const targetDrivenRunsEnabled = vscode.workspace
            .getConfiguration('hdl-helper', workspaceFolder.uri)
            .get<boolean>('targetDrivenRuns.enabled', false);

        if (targetDrivenRunsEnabled) {
            let targetId = `heuristic:${task.top}`;
            const configEnabled = vscode.workspace
                .getConfiguration('hdl-helper', workspaceFolder.uri)
                .get<boolean>('projectConfig.enabled', false);

            if (configEnabled) {
                const configService = new ProjectConfigService(workspaceFolder.uri.fsPath);
                const projectConfig = await configService.loadConfig();
                const targetContextService = new TargetContextService(workspaceFolder.uri.fsPath, {
                    projectConfig,
                    designTop: stateService.getDesignTop(),
                    simulationTop: stateService.getSimulationTop()
                });
                const activeContext = targetContextService.getActiveTargetContext();
                if (activeContext?.targetId) {
                    targetId = activeContext.targetId;
                }
                configService.dispose();
            }

            await writeRunRecordForTarget(stateService, targetId, {
                top: task.top,
                taskName: task.name,
                success: runResult.success,
                failureType: runResult.failureType,
                waveformPath: runResult.waveformPath,
                buildDir: runResult.buildDir,
                logPath: runResult.logPath
            });
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.viewWaveform', async (waveformRef: string, sourceUri?: vscode.Uri) => {
        let waveformPath = '';

        // 1) 入参是已存在的文件路径
        if (waveformRef && fs.existsSync(waveformRef)) {
            waveformPath = waveformRef;
        }

        // 2) 入参是模块名: 自动在 build 下查找 .fst/.vcd
        if (!waveformPath && waveformRef) {
            const workspaceFolder = resolveWorkspaceForContext(sourceUri);
            const wsPath = workspaceFolder?.uri.fsPath;
            if (!wsPath) {
                vscode.window.showErrorMessage('No workspace folder open for waveform lookup.');
                return;
            }
            const buildDir = path.join(wsPath, 'build');
            const fstPath = path.join(buildDir, `${waveformRef}.fst`);
            const vcdPath = path.join(buildDir, `${waveformRef}.vcd`);

            if (fs.existsSync(fstPath)) {
                waveformPath = fstPath;
            } else if (fs.existsSync(vcdPath)) {
                waveformPath = vcdPath;
            } else {
                waveformPath = findLatestWaveformInBuild(buildDir) || '';
            }
        }

        // 3) 仍未找到则让用户手选
        if (!waveformPath) {
            const picked = await vscode.window.showOpenDialog({
                canSelectMany: false,
                openLabel: 'Open Waveform',
                filters: {
                    'Waveform Files': ['fst', 'vcd']
                }
            });

            if (!picked || picked.length === 0) {
                vscode.window.showErrorMessage('No waveform file provided.');
                return;
            }

            waveformPath = picked[0].fsPath;
        }

        WaveformViewer.show(context.extensionUri, waveformPath);
    }));

    // =========================================================================
    // 8. 注册 EDA 工具 (Vivado 集成, Phase 7)
    // =========================================================================
    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.runVivadoSynth', async () => {
        const workspaceFolder = resolveWorkspaceForContext();
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a workspace first.');
            return;
        }
        const wsPath = workspaceFolder.uri.fsPath;
        // 这里需要获取实际的 top module，我们暂时通过用户输入来获取
        const topModule = await vscode.window.showInputBox({ 
            prompt: 'Enter top module name for Synthesis',
            value: 'top'
        });
        if (topModule) {
            await VivadoBridge.runSynth(wsPath, topModule);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.runVivadoImpl', async () => {
        const workspaceFolder = resolveWorkspaceForContext();
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a workspace first.');
            return;
        }
        const wsPath = workspaceFolder.uri.fsPath;
        await VivadoBridge.runImpl(wsPath);
    }));

    const xdcCompletionProvider = new XdcCompletionProvider(projectManager);
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            ['xdc'],
            xdcCompletionProvider
        )
    );

    // --- F. 调试命令 ---
    const classificationOutputChannel = vscode.window.createOutputChannel('HDL Helper - Classification');
    context.subscriptions.push(classificationOutputChannel);

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.debugProject', () => {
        const modules = projectManager.getAllModules();
        vscode.window.showInformationMessage(`工程中共有 ${modules.length} 个模块。`);
        vscode.commands.executeCommand('workbench.debug.action.toggleRepl');
        modules.forEach(m => console.log(`📦 ${m.name} (${path.basename(m.fileUri.fsPath)})`));
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.configureClassificationInspectorTopFileLimit', async () => {
        const workspaceFolder = resolveWorkspaceForContext();
        if (!workspaceFolder) {
            vscode.window.showWarningMessage('No workspace folder open');
            return;
        }

        const config = vscode.workspace.getConfiguration('hdl-helper', workspaceFolder.uri);
        const currentLimit = normalizeClassificationInspectorTopFileLimit(
            config.get<number>('workbench.classificationInspector.topFileLimit'),
            8
        );

        const picked = await vscode.window.showQuickPick([
            { label: 'Use 5 entries', value: 5 },
            { label: 'Use 8 entries (default)', value: 8 },
            { label: 'Use 12 entries', value: 12 },
            { label: 'Use 20 entries', value: 20 },
            { label: 'Custom value...', value: -1 }
        ], {
            placeHolder: `Current top-file preview limit: ${currentLimit}`
        });

        if (!picked) {
            return;
        }

        let nextLimit = picked.value;
        if (picked.value < 0) {
            const input = await vscode.window.showInputBox({
                prompt: 'Enter top-file preview limit (1-50)',
                value: String(currentLimit),
                validateInput: value => {
                    if (!/^\d+$/.test(value.trim())) {
                        return 'Please enter an integer between 1 and 50.';
                    }
                    const parsed = Number(value.trim());
                    if (parsed < 1 || parsed > 50) {
                        return 'Please enter an integer between 1 and 50.';
                    }
                    return undefined;
                }
            });

            if (!input) {
                return;
            }

            nextLimit = Number(input.trim());
        }

        const normalizedLimit = normalizeClassificationInspectorTopFileLimit(nextLimit, 8);
        await config.update(
            'workbench.classificationInspector.topFileLimit',
            normalizedLimit,
            vscode.ConfigurationTarget.Workspace
        );

        vscode.window.showInformationMessage(`Classification inspector top-file limit set to ${normalizedLimit}.`);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.debugProjectClassification', async () => {
        await debugProjectClassification(classificationOutputChannel);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.inspectProjectClassification', async (arg?: unknown) => {
        await inspectProjectClassification(classificationOutputChannel, arg);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.inspectProjectClassificationSummary', async (arg?: unknown) => {
        await inspectProjectClassificationSummary(classificationOutputChannel, arg);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.inspectProjectClassificationSummaryActive', async () => {
        await vscode.commands.executeCommand('hdl-helper.inspectProjectClassificationSummary', 'active');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.inspectProjectClassificationSummaryShared', async () => {
        await vscode.commands.executeCommand('hdl-helper.inspectProjectClassificationSummary', 'shared');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.inspectProjectClassificationSummaryProjectConfig', async () => {
        await vscode.commands.executeCommand('hdl-helper.inspectProjectClassificationSummary', 'project-config');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.inspectProjectClassificationSummaryHeuristic', async () => {
        await vscode.commands.executeCommand('hdl-helper.inspectProjectClassificationSummary', 'heuristic');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.debugProjectClassificationView', async (arg?: unknown) => {
        const presetArg = resolveClassificationDebugPresetArg(arg);
        if (presetArg) {
            await debugProjectClassification(
                classificationOutputChannel,
                buildClassificationRenderOptionsByPreset(presetArg)
            );
            return;
        }

        const picked = await vscode.window.showQuickPick([
            {
                label: 'All Sections',
                description: 'workspace + summary + coverage + details',
                preset: 'all' as const
            },
            {
                label: 'Overview',
                description: 'workspace + summary + coverage',
                preset: 'overview' as const
            },
            {
                label: 'Details Only',
                description: 'detailed file-by-file records only',
                preset: 'details' as const
            }
        ], {
            placeHolder: 'Select classification debug view preset'
        });

        if (!picked) {
            return;
        }

        await debugProjectClassification(
            classificationOutputChannel,
            buildClassificationRenderOptionsByPreset(picked.preset)
        );
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.debugProjectClassificationOverview', async () => {
        await vscode.commands.executeCommand('hdl-helper.debugProjectClassificationView', 'overview');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.debugProjectClassificationAll', async () => {
        await vscode.commands.executeCommand('hdl-helper.debugProjectClassificationView', 'all');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.debugProjectClassificationDetails', async () => {
        await vscode.commands.executeCommand('hdl-helper.debugProjectClassificationView', 'details');
    }));

    const targetContextOutputChannel = vscode.window.createOutputChannel('HDL Helper - Target Context');
    context.subscriptions.push(targetContextOutputChannel);

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.debugActiveTargetContext', async () => {
        await debugActiveTargetContext(targetContextOutputChannel, stateService);
    }));

    const recentRunsOutputChannel = vscode.window.createOutputChannel('HDL Helper - Recent Runs');
    context.subscriptions.push(recentRunsOutputChannel);

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.debugRecentRunsByTarget', async () => {
        await debugRecentRunsByTarget(stateService, recentRunsOutputChannel);
    }));

    const dualHierarchyOutputChannel = vscode.window.createOutputChannel('HDL Helper - Dual Hierarchy');
    context.subscriptions.push(dualHierarchyOutputChannel);

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.debugDualHierarchyState', async () => {
        await debugDualHierarchyState(treeProvider, stateService, dualHierarchyOutputChannel);
    }));

    // G. 生成接口文档 (Markdown) - 右键菜单触发
    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.generateDoc', async (item: HdlModule) => {
        if (!item || !(item instanceof HdlModule)) {
            return;
        }

        try {
            // 1. 生成 Markdown 内容
            const mdContent = DocGenerator.generateMarkdown(item);

            // 2. 创建一个虚拟的 Markdown 文档
            const doc = await vscode.workspace.openTextDocument({
                content: mdContent,
                language: 'markdown'
            });

            // 3. 在侧边栏显示 (ViewColumn.Beside)
            await vscode.window.showTextDocument(doc, {
                preview: false, // 不作为预览模式，而是可编辑的新文件
                viewColumn: vscode.ViewColumn.Beside
            });
        } catch (e) {
            vscode.window.showErrorMessage(`生成文档失败: ${e}`);
        }
    }));

    // =========================================================================
    // 修复后的命令：查看 Linter 规则帮助
    // =========================================================================
    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.listLintRules', async () => {
        const config = vscode.workspace.getConfiguration('hdl-helper');
        let binPath = config.get<string>('linter.veriblePath') || 'verible-verilog-lint';
        
        // 1. Windows 路径修正
        if (process.platform === 'win32') {
             if (!binPath.toLowerCase().endsWith('.exe')) {
                 if (path.isAbsolute(binPath) || binPath.includes('\\') || binPath.includes('/')) {
                     binPath += '.exe';
                 }
             }
        }

        vscode.window.setStatusBarMessage('$(sync~spin) 正在获取 Verible 规则列表...', 2000);

        // 2. 构造 Shell 命令
        // [修复] 必须显式加上 =all，否则 Google 的参数解析库会报 "Missing value"
        const cmd = `"${binPath}" --help_rules=all`;

        // console.log(`[Exec] ${cmd}`); 

        cp.exec(cmd, (err, stdout, stderr) => {
            if (err && (err as any).code === 127) { 
                vscode.window.showErrorMessage(`无法找到 Verible 工具: ${binPath}`);
                return;
            }

            const output = stdout.trim() || stderr.trim();

            if (output) {
                vscode.workspace.openTextDocument({
                    content: output,
                    language: 'markdown' 
                }).then(doc => {
                    vscode.window.showTextDocument(doc, { preview: false });
                });
            } else {
                vscode.window.showErrorMessage(`获取失败。请尝试在终端运行: "${binPath}" --help_rules=all`);
            }
        });
    }));


    // =========================================================================
    // 4. 启动 Language Server
    // =========================================================================
    activateLanguageServer(context);
}

export function deactivate() {
    return deactivateLanguageServer();
}