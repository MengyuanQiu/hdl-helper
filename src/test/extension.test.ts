import * as assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { FilelistParser } from '../project/filelistParser';
import { ClassificationService } from '../project/classificationService';
import { NormalizedProjectConfig, PhysicalFileType, ProjectConfigStatus, Role, SourceOfTruth, TargetKind } from '../project/types';
import { buildSourceGroupDescription, buildToolchainStatusDiagnosticsEntries, getLatestLogEntries, getLatestWaveformEntries, HdlTreeProvider, prioritizeTargetEntries } from '../project/hdlTreeProvider';
import { HdlInstance, HdlModule, HdlPort } from '../project/hdlSymbol';
import { mapLegacyTopSelection } from '../project/topSelectionPolicy';
import { SourceSetService } from '../project/sourceSetService';
import { TargetContextService } from '../project/targetContextService';
import {
	getDualHierarchyChecklistPath,
	openDualHierarchyRegressionChecklist
} from '../commands/openDualHierarchyRegressionChecklist';
import {
	getSemanticWorkbenchChecklistPath,
	openSemanticWorkbenchReleaseChecklist
} from '../commands/openSemanticWorkbenchReleaseChecklist';
import {
	buildProjectConfigTemplate,
	inferDefaultTops
} from '../commands/createProjectConfig';
import { buildTargetContextDebugSnapshot } from '../commands/debugActiveTargetContext';
import {
	buildClassificationInspectorActiveContextLines,
	buildClassificationInspectorDetailLines,
	buildClassificationInspectorQuickPickItem,
	buildClassificationInspectorSummaryLines,
	buildClassificationInspectorTopFilePreviewEntries,
	buildClassificationInspectorTopFilePreviewLines,
	normalizeClassificationInspectorTopFileLimit,
	buildClassificationDebugSections,
	buildClassificationObservabilityStats,
	buildClassificationRenderOptionsByPreset,
	filterClassificationInspectorResults,
	filterClassificationDebugSections,
	formatClassificationDebugReport,
	getClassificationDebugSectionPriority,
	getClassificationDebugSectionTypesByPreset,
	resolveClassificationInspectorScopeArg,
	resolveClassificationInspectorSummaryArg,
	resolveClassificationDebugPresetArg,
	renderClassificationDebugSections
} from '../commands/debugProjectClassification';
import { getProjectConfigPath, openProjectConfig } from '../commands/openProjectConfig';
import { formatRunRecords } from '../commands/debugRecentRuns';
import { pickRunRecordForTarget } from '../commands/openLastWaveformByTarget';
import { getLogPathFromRunRecord } from '../commands/openLastLogByTarget';
import { getRecentRunActions, getRecentRunEntries, prioritizeActiveTarget } from '../commands/openRecentRuns';
import { getAvailableArtifactActions, getMissingArtifactReasons } from '../commands/openLastRunArtifactsByTarget';
import { pickRunRecordByTarget } from '../commands/openRunRecordArtifacts';
import { resolveRerunTop, resolveTargetIdFromRerunArg } from '../commands/rerunTargetRun';
import { getSimulationTasksFilePath, openSimulationTasksFile } from '../commands/openSimulationTasksFile';
import {
	buildConfigFallbackWarning,
	buildContextDrivenSimTask,
	resolveFallbackSimulationTop,
	resolveRunTargetId
} from '../commands/runActiveTargetSimulation';
import {
	buildToolchainStatusForProfile,
	collectToolchainProfileNames,
	normalizeToolchainProfileProbeMap,
	resolveToolchainHealthProfileArg,
	resolveToolchainProbeIdsForProfile,
	selectToolchainProbesForProfile
} from '../commands/debugToolchainHealth';
import { resolveHeuristicRunTargetId, writeRunRecordForTarget } from '../simulation/runsService';
import { buildConfigIssues } from '../project/configDiagnostics';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	function createModule(name: string, fileName: string, isTestbench = false): HdlModule {
		const fileUri = vscode.Uri.file(path.join(os.tmpdir(), fileName));
		const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 10));
		const mod = new HdlModule(name, fileUri, range);
		if (!isTestbench) {
			mod.addPort(new HdlPort('clk_i', 'input', 'logic'));
		}
		return mod;
	}

	function createMockProjectManager(modules: HdlModule[]) {
		const modMap = new Map(modules.map(m => [m.name, m]));
		return {
			isScanning: () => false,
			getAllModules: () => modules,
			getModule: (name: string) => modMap.get(name),
			getModuleInWorkspace: (name: string) => modMap.get(name),
			getLastScanSummary: () => ({ workspaceCount: 1, fileCount: 1, moduleCount: modules.length, lastError: '' })
		};
	}

	async function getRootLabels(provider: HdlTreeProvider): Promise<string[]> {
		const roots = await provider.getChildren();
		return roots.map(root => String(provider.getTreeItem(root).label));
	}

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Filelist parser handles nested filelists and env vars', () => {
		const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hdl-helper-filelist-'));
		const rtlDir = path.join(tempRoot, 'rtl');
		const tbDir = path.join(tempRoot, 'tb');
		const incDir = path.join(tempRoot, 'inc');
		fs.mkdirSync(rtlDir, { recursive: true });
		fs.mkdirSync(tbDir, { recursive: true });
		fs.mkdirSync(incDir, { recursive: true });

		const rtlFile = path.join(rtlDir, 'dut.sv');
		const tbFile = path.join(tbDir, 'tb_top.sv');
		fs.writeFileSync(rtlFile, 'module dut; endmodule\n', 'utf8');
		fs.writeFileSync(tbFile, 'module tb_top; endmodule\n', 'utf8');

		const subFilelist = path.join(tempRoot, 'sub.f');
		const mainFilelist = path.join(tempRoot, 'main.f');

		process.env.HDL_HELPER_TEST_ROOT = tempRoot;
		process.env.HDL_HELPER_TEST_INC = incDir;

		fs.writeFileSync(
			subFilelist,
			'-v rtl/dut.sv\n+incdir+$HDL_HELPER_TEST_INC\n',
			'utf8'
		);

		fs.writeFileSync(
			mainFilelist,
			'-f sub.f\n${HDL_HELPER_TEST_ROOT}/tb/tb_top.sv\n%HDL_HELPER_TEST_ROOT%/rtl/dut.sv\n',
			'utf8'
		);

		const parsed = FilelistParser.parseDetailed(mainFilelist);
		assert.ok(parsed.sourceFiles.includes(rtlFile));
		assert.ok(parsed.sourceFiles.includes(tbFile));
		assert.ok(parsed.includeDirs.includes(incDir));
		assert.strictEqual(FilelistParser.parse(mainFilelist).length, parsed.sourceFiles.length);

		fs.rmSync(tempRoot, { recursive: true, force: true });
		delete process.env.HDL_HELPER_TEST_ROOT;
		delete process.env.HDL_HELPER_TEST_INC;
	});

	test('Classification heuristic defaults unknown HDL paths to design', () => {
		const workspaceRoot = path.join(os.tmpdir(), 'hdl-helper-classification-root');
		const service = new ClassificationService({ workspaceRoot });

		const unknownHdl = service.classifyFile(vscode.Uri.file(path.join(workspaceRoot, 'misc', 'child.sv')));
		const testbenchByName = service.classifyFile(vscode.Uri.file(path.join(workspaceRoot, 'misc', 'tb_top.sv')));
		const checkerByName = service.classifyFile(vscode.Uri.file(path.join(workspaceRoot, 'misc', 'alu_checker.sv')));

		assert.strictEqual(unknownHdl.rolePrimary, Role.Design);
		assert.strictEqual(testbenchByName.rolePrimary, Role.Simulation);
		assert.strictEqual(checkerByName.rolePrimary, Role.Verification);
	});

	test('Classification config mode reports primary and secondary roles for shared source-set file', () => {
		const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hdl-helper-classification-shared-'));
		const sharedDir = path.join(tempRoot, 'shared');
		fs.mkdirSync(sharedDir, { recursive: true });

		const sharedPath = path.join(sharedDir, 'common_pkg.sv');
		fs.writeFileSync(sharedPath, 'package common_pkg; endpackage\n', 'utf8');

		const projectConfig: NormalizedProjectConfig = {
			version: '1.0',
			name: 'repo',
			root: tempRoot,
			sourceSets: {
				design: {
					name: 'design',
					role: Role.Design,
					includes: ['shared/**/*.sv']
				},
				verification: {
					name: 'verification',
					role: Role.Verification,
					includes: ['shared/**/*.sv']
				}
			},
			tops: {
				design: 'dut_top'
			},
			targets: {
				design_default: {
					id: 'design_default',
					kind: TargetKind.Design,
					top: 'dut_top',
					sourceSets: ['design']
				}
			},
			activeTarget: 'design_default'
		};

		const service = new ClassificationService({
			workspaceRoot: tempRoot,
			projectConfig,
			activeTarget: 'design_default'
		});

		const result = service.classifyFile(vscode.Uri.file(sharedPath));
		assert.strictEqual(result.sourceOfTruth, SourceOfTruth.ProjectConfig);
		assert.strictEqual(result.rolePrimary, Role.Design);
		assert.deepStrictEqual(result.roleSecondary, [Role.Verification]);
		assert.deepStrictEqual(result.referencedBySourceSets, ['design', 'verification']);
		assert.strictEqual(result.inActiveTarget, true);

		fs.rmSync(tempRoot, { recursive: true, force: true });
	});

	test('Source group description includes shared and active metadata', () => {
		const description = buildSourceGroupDescription([
			{
				uri: 'C:/repo/rtl/dut.sv',
				physicalType: PhysicalFileType.SystemVerilog,
				rolePrimary: Role.Design,
				roleSecondary: [],
				sourceOfTruth: SourceOfTruth.ProjectConfig,
				inActiveTarget: true,
				referencedBySourceSets: ['design']
			},
			{
				uri: 'C:/repo/shared/common_pkg.sv',
				physicalType: PhysicalFileType.SystemVerilog,
				rolePrimary: Role.Design,
				roleSecondary: [Role.Verification],
				sourceOfTruth: SourceOfTruth.ProjectConfig,
				inActiveTarget: false,
				referencedBySourceSets: ['design', 'verification']
			}
		]);

		assert.strictEqual(description, '2 files | 1 shared | 1 active');
	});

	test('Classification observability stats includes shared, active and source-set coverage', () => {
		const stats = buildClassificationObservabilityStats([
			{
				uri: 'C:/repo/rtl/dut.sv',
				physicalType: PhysicalFileType.SystemVerilog,
				rolePrimary: Role.Design,
				roleSecondary: [],
				sourceOfTruth: SourceOfTruth.ProjectConfig,
				inActiveTarget: true,
				referencedBySourceSets: ['design']
			},
			{
				uri: 'C:/repo/shared/common_pkg.sv',
				physicalType: PhysicalFileType.SystemVerilog,
				rolePrimary: Role.Design,
				roleSecondary: [Role.Simulation],
				sourceOfTruth: SourceOfTruth.ProjectConfig,
				inActiveTarget: true,
				referencedBySourceSets: ['design', 'simulation']
			},
			{
				uri: 'C:/repo/tb/tb_top.sv',
				physicalType: PhysicalFileType.SystemVerilog,
				rolePrimary: Role.Simulation,
				roleSecondary: [],
				sourceOfTruth: SourceOfTruth.ProjectConfig,
				inActiveTarget: false,
				referencedBySourceSets: ['simulation']
			}
		]);

		assert.strictEqual(stats.totalFiles, 3);
		assert.strictEqual(stats.sharedFiles, 1);
		assert.strictEqual(stats.activeTargetFiles, 2);
		assert.deepStrictEqual(stats.sourceSetCoverage, {
			design: 2,
			simulation: 2
		});
	});

	test('Classification observability stats deduplicates repeated source-set names per file', () => {
		const stats = buildClassificationObservabilityStats([
			{
				uri: 'C:/repo/shared/common_pkg.sv',
				physicalType: PhysicalFileType.SystemVerilog,
				rolePrimary: Role.Design,
				roleSecondary: [Role.Verification],
				sourceOfTruth: SourceOfTruth.ProjectConfig,
				inActiveTarget: true,
				referencedBySourceSets: ['design', 'design', 'verification']
			}
		]);

		assert.deepStrictEqual(stats.sourceSetCoverage, {
			design: 1,
			verification: 1
		});
	});

	test('Classification debug report formatter renders deterministic sections', () => {
		const lines = formatClassificationDebugReport({
			workspaceName: 'repo',
			workspaceRoot: 'C:/repo',
			configStatus: ProjectConfigStatus.Valid,
			config: {
				name: 'repo',
				version: '1.0',
				sourceSetCount: 2,
				targetCount: 1,
				activeTarget: 'sim_default'
			},
			hdlFileCount: 2,
			roleCounts: {
				simulation: 1,
				design: 1
			},
			stats: {
				totalFiles: 2,
				sharedFiles: 1,
				activeTargetFiles: 1,
				sourceSetCoverage: {
					simulation: 2,
					design: 1
				}
			},
			results: [
				{
					uri: 'C:/repo/tb/tb_top.sv',
					physicalType: PhysicalFileType.SystemVerilog,
					rolePrimary: Role.Simulation,
					roleSecondary: [],
					sourceOfTruth: SourceOfTruth.ProjectConfig,
					inActiveTarget: true,
					referencedBySourceSets: ['simulation']
				}
			]
		});

		assert.ok(lines.includes('Classification Summary:'));
		assert.ok(lines.includes('SourceSet Coverage:'));
		assert.ok(lines.includes('  shared files: 1'));
		assert.ok(lines.includes('  active target files: 1'));
		assert.ok(lines.includes('  design: 1 files'));
		assert.ok(lines.includes('  simulation: 1 files'));
		assert.ok(lines.includes('  simulation: 2 files'));
		assert.ok(lines.includes('Detailed Classification Results:'));

		const designIndex = lines.indexOf('  design: 1 files');
		const simulationIndex = lines.indexOf('  simulation: 1 files');
		assert.ok(designIndex >= 0 && simulationIndex >= 0 && designIndex < simulationIndex);
	});

	test('Classification debug section builder returns expected section titles', () => {
		const sections = buildClassificationDebugSections({
			workspaceName: 'repo',
			workspaceRoot: 'C:/repo',
			configStatus: ProjectConfigStatus.Valid,
			hdlFileCount: 0,
			roleCounts: {},
			stats: {
				totalFiles: 0,
				sharedFiles: 0,
				activeTargetFiles: 0,
				sourceSetCoverage: {}
			},
			results: []
		});

		assert.deepStrictEqual(
			sections.map(section => section.title),
			['', '', '', 'Classification Summary:', 'SourceSet Coverage:', 'Detailed Classification Results:']
		);
		assert.deepStrictEqual(
			sections.map(section => section.id),
			['workspace', 'config', 'discovery', 'summary', 'source-set-coverage', 'details']
		);
		assert.deepStrictEqual(
			sections.map(section => section.type),
			['workspace', 'config', 'discovery', 'summary', 'source-set-coverage', 'details']
		);
	});

	test('Classification debug section renderer emits headers and trailing separator', () => {
		const rendered = renderClassificationDebugSections([
			{ id: 'a', type: 'summary', title: 'Section A', lines: ['  line-a'] },
			{ id: 'b', type: 'details', title: '', lines: ['  line-b'] }
		]);

		assert.ok(rendered.includes('Section A'));
		assert.ok(rendered.includes('  line-a'));
		assert.ok(rendered.includes('  line-b'));
		assert.strictEqual(rendered[rendered.length - 1], '-'.repeat(80));
	});

	test('Classification debug section priority keeps summary before details', () => {
		assert.ok(
			getClassificationDebugSectionPriority('summary') < getClassificationDebugSectionPriority('details')
		);
	});

	test('Classification debug section preset filter returns expected types', () => {
		const overviewTypes = getClassificationDebugSectionTypesByPreset('overview');
		assert.ok(overviewTypes.has('summary'));
		assert.ok(!overviewTypes.has('details'));

		const detailsTypes = getClassificationDebugSectionTypesByPreset('details');
		assert.deepStrictEqual(Array.from(detailsTypes), ['details']);
	});

	test('Classification debug section filtering applies preset and stable ordering', () => {
		const sections = [
			{ id: 'details', type: 'details' as const, title: 'Details', lines: ['d'] },
			{ id: 'summary', type: 'summary' as const, title: 'Summary', lines: ['s'] },
			{ id: 'workspace', type: 'workspace' as const, title: '', lines: ['w'] }
		];

		const overview = filterClassificationDebugSections(sections, { preset: 'overview' });
		assert.deepStrictEqual(overview.map(section => section.type), ['workspace', 'summary']);

		const detailsOnly = filterClassificationDebugSections(sections, {
			preset: 'all',
			includeTypes: ['details']
		});
		assert.deepStrictEqual(detailsOnly.map(section => section.type), ['details']);
	});

	test('Classification render options helper maps preset directly', () => {
		assert.deepStrictEqual(buildClassificationRenderOptionsByPreset('all'), { preset: 'all' });
		assert.deepStrictEqual(buildClassificationRenderOptionsByPreset('overview'), { preset: 'overview' });
		assert.deepStrictEqual(buildClassificationRenderOptionsByPreset('details'), { preset: 'details' });
	});

	test('Classification preset arg resolver supports string and object payloads', () => {
		assert.strictEqual(resolveClassificationDebugPresetArg(' ALL '), 'all');
		assert.strictEqual(resolveClassificationDebugPresetArg('overview'), 'overview');
		assert.strictEqual(resolveClassificationDebugPresetArg('DETAILS'), 'details');
		assert.strictEqual(resolveClassificationDebugPresetArg({ preset: 'all' }), 'all');
		assert.strictEqual(resolveClassificationDebugPresetArg({ view: 'overview' }), 'overview');
		assert.strictEqual(resolveClassificationDebugPresetArg({ mode: 'details' }), 'details');
		assert.strictEqual(resolveClassificationDebugPresetArg('unknown'), undefined);
		assert.strictEqual(resolveClassificationDebugPresetArg({ preset: 'unknown' }), undefined);
	});

	test('Classification inspector helpers build quick-pick and detail lines', () => {
		const result = {
			uri: 'C:/repo/shared/common_pkg.sv',
			physicalType: PhysicalFileType.SystemVerilog,
			rolePrimary: Role.Design,
			roleSecondary: [Role.Verification],
			sourceOfTruth: SourceOfTruth.ProjectConfig,
			inActiveTarget: true,
			referencedBySourceSets: ['design', 'verification'],
			referencedByTargets: ['sim_default']
		};

		const item = buildClassificationInspectorQuickPickItem(result, 'C:/repo');
		assert.strictEqual(item.label, 'shared/common_pkg.sv');
		assert.strictEqual(item.description, 'design | systemverilog');
		assert.ok(item.detail.includes('truth=project_config'));

		const lines = buildClassificationInspectorDetailLines(result, 'C:/repo');
		assert.ok(lines.includes('Relative Path: shared/common_pkg.sv'));
		assert.ok(lines.includes('Inspector Scope: all'));
		assert.ok(lines.includes('Role (Secondary): verification'));
		assert.ok(lines.includes('Referenced by Source Sets: design, verification'));
		assert.ok(lines.includes('Referenced by Targets: sim_default'));
	});

	test('Classification inspector detail lines include active target context metadata', () => {
		const result = {
			uri: 'C:/repo/shared/common_pkg.sv',
			physicalType: PhysicalFileType.SystemVerilog,
			rolePrimary: Role.Design,
			roleSecondary: [Role.Verification],
			sourceOfTruth: SourceOfTruth.ProjectConfig,
			inActiveTarget: true,
			referencedBySourceSets: ['design', 'verification'],
			referencedByTargets: ['sim_default']
		};

		const context = {
			targetId: 'sim_default',
			kind: TargetKind.Simulation,
			top: 'tb_top',
			resolvedFiles: ['C:\\repo\\shared\\common_pkg.sv', 'C:\\repo\\rtl\\dut.sv'],
			includeDirs: ['inc/common', 'inc/sim'],
			defines: { WIDTH: '32', USE_ASSERT: '1' },
			constraints: [],
			scripts: [],
			filelist: 'sim/sim.f',
			toolProfile: 'iverilog-default',
			sourceSets: ['design', 'simulation']
		};

		const lines = buildClassificationInspectorDetailLines(result, 'C:/repo', 'active', context);
		assert.ok(lines.includes('Resolved Path: shared/common_pkg.sv'));
		assert.ok(lines.includes('Active Target Context: sim_default (simulation)'));
		assert.ok(lines.includes('Active Target Top: tb_top'));
		assert.ok(lines.includes('In Active Target Resolved Files: true'));
		assert.ok(lines.includes('Active Target Source Sets: design, simulation'));
		assert.ok(lines.includes('Effective Include Dirs: inc/common, inc/sim'));
		assert.ok(lines.includes('Effective Defines: USE_ASSERT=1, WIDTH=32'));
		assert.ok(lines.includes('Active Target Filelist: sim/sim.f'));
		assert.ok(lines.includes('Active Target Tool Profile: iverilog-default'));

		const fallbackLines = buildClassificationInspectorActiveContextLines(result, undefined);
		assert.ok(fallbackLines.includes('Active Target Context: (unavailable)'));
	});

	test('Classification inspector scope arg resolver supports string and object payloads', () => {
		assert.strictEqual(resolveClassificationInspectorScopeArg('active'), 'active');
		assert.strictEqual(resolveClassificationInspectorScopeArg('ACTIVE_TARGET'), 'active');
		assert.strictEqual(resolveClassificationInspectorScopeArg('project_config'), 'project-config');
		assert.strictEqual(resolveClassificationInspectorScopeArg({ scope: 'shared' }), 'shared');
		assert.strictEqual(resolveClassificationInspectorScopeArg({ preset: 'heuristic' }), 'heuristic');
		assert.strictEqual(resolveClassificationInspectorScopeArg({ mode: 'all' }), 'all');
		assert.strictEqual(resolveClassificationInspectorScopeArg('unknown'), undefined);
	});

	test('Classification inspector summary arg resolver supports scope and top-file presets', () => {
		const scopeOnly = resolveClassificationInspectorSummaryArg('active');
		assert.strictEqual(scopeOnly.scopePreset, 'active');
		assert.strictEqual(scopeOnly.topFileLimit, undefined);

		const compact = resolveClassificationInspectorSummaryArg('compact');
		assert.strictEqual(compact.scopePreset, undefined);
		assert.strictEqual(compact.topFileLimit, 5);

		const numeric = resolveClassificationInspectorSummaryArg(12);
		assert.strictEqual(numeric.topFileLimit, 12);

		const expanded = resolveClassificationInspectorSummaryArg({
			scope: 'shared',
			profile: 'expanded'
		});
		assert.strictEqual(expanded.scopePreset, 'shared');
		assert.strictEqual(expanded.topFileLimit, 20);

		const capped = resolveClassificationInspectorSummaryArg({
			scope: 'project-config',
			topFileLimit: 100
		});
		assert.strictEqual(capped.scopePreset, 'project-config');
		assert.strictEqual(capped.topFileLimit, 50);

		assert.deepStrictEqual(resolveClassificationInspectorSummaryArg('unknown'), {});
	});

	test('Classification inspector scope filter returns expected subsets', () => {
		const results = [
			{
				uri: 'C:/repo/rtl/dut.sv',
				physicalType: PhysicalFileType.SystemVerilog,
				rolePrimary: Role.Design,
				roleSecondary: [],
				sourceOfTruth: SourceOfTruth.ProjectConfig,
				inActiveTarget: true,
				referencedBySourceSets: ['design']
			},
			{
				uri: 'C:/repo/shared/common_pkg.sv',
				physicalType: PhysicalFileType.SystemVerilog,
				rolePrimary: Role.Design,
				roleSecondary: [Role.Verification],
				sourceOfTruth: SourceOfTruth.ProjectConfig,
				inActiveTarget: false,
				referencedBySourceSets: ['design', 'verification']
			},
			{
				uri: 'C:/repo/misc/tmp.sv',
				physicalType: PhysicalFileType.SystemVerilog,
				rolePrimary: Role.Design,
				roleSecondary: [],
				sourceOfTruth: SourceOfTruth.Heuristic,
				inActiveTarget: false,
				referencedBySourceSets: []
			}
		];

		assert.strictEqual(filterClassificationInspectorResults(results, 'all').length, 3);
		assert.deepStrictEqual(
			filterClassificationInspectorResults(results, 'active').map(item => item.uri),
			['C:/repo/rtl/dut.sv']
		);
		assert.deepStrictEqual(
			filterClassificationInspectorResults(results, 'shared').map(item => item.uri),
			['C:/repo/shared/common_pkg.sv']
		);
		assert.deepStrictEqual(
			filterClassificationInspectorResults(results, 'project-config').map(item => item.uri),
			['C:/repo/rtl/dut.sv', 'C:/repo/shared/common_pkg.sv']
		);
		assert.deepStrictEqual(
			filterClassificationInspectorResults(results, 'heuristic').map(item => item.uri),
			['C:/repo/misc/tmp.sv']
		);
	});

	test('Classification inspector summary lines include deterministic breakdowns', () => {
		const results = [
			{
				uri: 'C:/repo/rtl/dut.sv',
				physicalType: PhysicalFileType.SystemVerilog,
				rolePrimary: Role.Design,
				roleSecondary: [],
				sourceOfTruth: SourceOfTruth.ProjectConfig,
				inActiveTarget: true,
				referencedBySourceSets: ['design']
			},
			{
				uri: 'C:/repo/shared/common_pkg.sv',
				physicalType: PhysicalFileType.SystemVerilog,
				rolePrimary: Role.Design,
				roleSecondary: [Role.Verification],
				sourceOfTruth: SourceOfTruth.ProjectConfig,
				inActiveTarget: false,
				referencedBySourceSets: ['design', 'verification']
			},
			{
				uri: 'C:/repo/misc/tmp.sv',
				physicalType: PhysicalFileType.SystemVerilog,
				rolePrimary: Role.Design,
				roleSecondary: [],
				sourceOfTruth: SourceOfTruth.Heuristic,
				inActiveTarget: false,
				referencedBySourceSets: []
			}
		];

		const lines = buildClassificationInspectorSummaryLines(results, 'all', {
			workspaceName: 'repo',
			workspaceRoot: 'C:/repo'
		});

		assert.ok(lines.includes('HDL Helper - Classification Inspector Summary'));
		assert.ok(lines.includes('Inspector Scope: all'));
		assert.ok(lines.includes('Workspace: repo'));
		assert.ok(lines.includes('Matched Files: 3'));
		assert.ok(lines.includes('Matched Active Target Files: 1'));
		assert.ok(lines.includes('Matched Shared Files: 1'));
		assert.ok(lines.includes('  heuristic: 1'));
		assert.ok(lines.includes('  project_config: 2'));
		assert.ok(lines.includes('  design: 3'));
		assert.ok(lines.includes('  design: 2'));
		assert.ok(lines.includes('  verification: 1'));
		assert.ok(lines.includes('Top Files Preview (up to 8):'));
		assert.ok(lines.some(line => line.startsWith('  [A-] rtl/dut.sv')));
		assert.ok(lines.some(line => line.startsWith('  [-S] shared/common_pkg.sv')));
	});

	test('Classification inspector summary lines honor explicit top-file limit', () => {
		const results = [
			{
				uri: 'C:/repo/rtl/dut.sv',
				physicalType: PhysicalFileType.SystemVerilog,
				rolePrimary: Role.Design,
				roleSecondary: [],
				sourceOfTruth: SourceOfTruth.ProjectConfig,
				inActiveTarget: true,
				referencedBySourceSets: ['design']
			},
			{
				uri: 'C:/repo/shared/common_pkg.sv',
				physicalType: PhysicalFileType.SystemVerilog,
				rolePrimary: Role.Design,
				roleSecondary: [Role.Verification],
				sourceOfTruth: SourceOfTruth.ProjectConfig,
				inActiveTarget: false,
				referencedBySourceSets: ['design', 'verification']
			},
			{
				uri: 'C:/repo/misc/fallback.sv',
				physicalType: PhysicalFileType.SystemVerilog,
				rolePrimary: Role.Design,
				roleSecondary: [],
				sourceOfTruth: SourceOfTruth.Heuristic,
				inActiveTarget: false,
				referencedBySourceSets: []
			}
		];

		const lines = buildClassificationInspectorSummaryLines(results, 'all', {
			workspaceRoot: 'C:/repo',
			topFileLimit: 2
		});

		assert.ok(lines.includes('Top Files Preview (up to 2):'));
		assert.strictEqual(lines.filter(line => line.startsWith('  [')).length, 2);
	});

	test('Classification inspector top file preview keeps deterministic priority', () => {
		const lines = buildClassificationInspectorTopFilePreviewLines([
			{
				uri: 'C:/repo/misc/fallback.sv',
				physicalType: PhysicalFileType.SystemVerilog,
				rolePrimary: Role.Design,
				roleSecondary: [],
				sourceOfTruth: SourceOfTruth.Heuristic,
				inActiveTarget: false,
				referencedBySourceSets: []
			},
			{
				uri: 'C:/repo/shared/common_pkg.sv',
				physicalType: PhysicalFileType.SystemVerilog,
				rolePrimary: Role.Design,
				roleSecondary: [Role.Verification],
				sourceOfTruth: SourceOfTruth.ProjectConfig,
				inActiveTarget: false,
				referencedBySourceSets: ['design', 'verification']
			},
			{
				uri: 'C:/repo/rtl/dut.sv',
				physicalType: PhysicalFileType.SystemVerilog,
				rolePrimary: Role.Design,
				roleSecondary: [],
				sourceOfTruth: SourceOfTruth.ProjectConfig,
				inActiveTarget: true,
				referencedBySourceSets: ['design']
			}
		], {
			workspaceRoot: 'C:/repo',
			limit: 3
		});

		assert.strictEqual(lines[0], '  [A-] rtl/dut.sv | truth=project_config | role=design');
		assert.strictEqual(lines[1], '  [-S] shared/common_pkg.sv | truth=project_config | role=design');
		assert.strictEqual(lines[2], '  [--] misc/fallback.sv | truth=heuristic | role=design');
	});

	test('Classification inspector top file preview entries keep deterministic priority and limit', () => {
		const entries = buildClassificationInspectorTopFilePreviewEntries([
			{
				uri: 'C:/repo/misc/fallback.sv',
				physicalType: PhysicalFileType.SystemVerilog,
				rolePrimary: Role.Design,
				roleSecondary: [],
				sourceOfTruth: SourceOfTruth.Heuristic,
				inActiveTarget: false,
				referencedBySourceSets: []
			},
			{
				uri: 'C:/repo/shared/common_pkg.sv',
				physicalType: PhysicalFileType.SystemVerilog,
				rolePrimary: Role.Design,
				roleSecondary: [Role.Verification],
				sourceOfTruth: SourceOfTruth.ProjectConfig,
				inActiveTarget: false,
				referencedBySourceSets: ['design', 'verification']
			},
			{
				uri: 'C:/repo/rtl/dut.sv',
				physicalType: PhysicalFileType.SystemVerilog,
				rolePrimary: Role.Design,
				roleSecondary: [],
				sourceOfTruth: SourceOfTruth.ProjectConfig,
				inActiveTarget: true,
				referencedBySourceSets: ['design']
			}
		], {
			workspaceRoot: 'C:/repo',
			limit: 2
		});

		assert.strictEqual(entries.length, 2);
		assert.strictEqual(entries[0].pathLabel, 'rtl/dut.sv');
		assert.strictEqual(entries[1].pathLabel, 'shared/common_pkg.sv');
	});

	test('Classification inspector top file limit normalization clamps invalid values', () => {
		assert.strictEqual(normalizeClassificationInspectorTopFileLimit(undefined), 8);
		assert.strictEqual(normalizeClassificationInspectorTopFileLimit(-3), 1);
		assert.strictEqual(normalizeClassificationInspectorTopFileLimit(0), 1);
		assert.strictEqual(normalizeClassificationInspectorTopFileLimit(2.9), 2);
		assert.strictEqual(normalizeClassificationInspectorTopFileLimit(100), 50);
		assert.strictEqual(normalizeClassificationInspectorTopFileLimit(12), 12);
	});

	test('Classification debug formatter supports overview preset output', () => {
		const lines = formatClassificationDebugReport({
			workspaceName: 'repo',
			workspaceRoot: 'C:/repo',
			configStatus: ProjectConfigStatus.Valid,
			hdlFileCount: 1,
			roleCounts: { design: 1 },
			stats: {
				totalFiles: 1,
				sharedFiles: 0,
				activeTargetFiles: 1,
				sourceSetCoverage: { design: 1 }
			},
			results: [
				{
					uri: 'C:/repo/rtl/dut.sv',
					physicalType: PhysicalFileType.SystemVerilog,
					rolePrimary: Role.Design,
					roleSecondary: [],
					sourceOfTruth: SourceOfTruth.ProjectConfig,
					inActiveTarget: true,
					referencedBySourceSets: ['design']
				}
			]
		}, buildClassificationRenderOptionsByPreset('overview'));

		assert.ok(lines.includes('Classification Summary:'));
		assert.ok(lines.includes('SourceSet Coverage:'));
		assert.ok(!lines.includes('Detailed Classification Results:'));
		assert.ok(!lines.some(line => line.startsWith('File: C:/repo/rtl/dut.sv')));
	});

	test('Dual hierarchy keeps Design/Simulation tops independent', async () => {
		const dut = createModule('dut', 'dut.sv');
		const tbA = createModule('tb_a', 'tb_a.sv', true);
		const tbB = createModule('tb_b', 'tb_b.sv', true);
		tbA.addInstance(new HdlInstance('dut', 'u_dut_a', tbA.range, tbA.fileUri));
		tbB.addInstance(new HdlInstance('dut', 'u_dut_b', tbB.range, tbB.fileUri));

		const pm = createMockProjectManager([dut, tbA, tbB]);
		const provider = new HdlTreeProvider(pm as any);
		provider.setDesignTopModule('dut');
		provider.setSimulationTopModule('tb_a');

		const providerAny = provider as any;
		providerAny.getScopedModuleNameSet = async (_kind: string) => new Set(['dut', 'tb_a', 'tb_b']);

		const designChildren = await providerAny.getScopedHierarchyChildren('design');
		const simChildrenA = await providerAny.getScopedHierarchyChildren('simulation');

		assert.strictEqual((designChildren[0] as any).module.name, 'dut');
		assert.strictEqual((simChildrenA[0] as any).module.name, 'tb_a');

		provider.setSimulationTopModule('tb_b');
		const designChildrenAfter = await providerAny.getScopedHierarchyChildren('design');
		const simChildrenB = await providerAny.getScopedHierarchyChildren('simulation');

		assert.strictEqual((designChildrenAfter[0] as any).module.name, 'dut');
		assert.strictEqual((simChildrenB[0] as any).module.name, 'tb_b');
	});

	test('Dual hierarchy shows warning when top is out of scoped module set', async () => {
		const dut = createModule('dut', 'dut_scoped.sv');
		const helper = createModule('helper', 'helper_scoped.sv');
		const pm = createMockProjectManager([dut, helper]);
		const provider = new HdlTreeProvider(pm as any);
		provider.setDesignTopModule('helper');

		const providerAny = provider as any;
		providerAny.getScopedModuleNameSet = async (_kind: string) => new Set(['dut']);

		const designChildren = await providerAny.getScopedHierarchyChildren('design');
		assert.strictEqual((designChildren[0] as any).label, 'Design top is out of scoped sources');
	});

	test('Root nodes exclude dual hierarchy branches when dualHierarchy is disabled', async () => {
		const dut = createModule('dut', 'dut_root_off.sv');
		const pm = createMockProjectManager([dut]);
		const provider = new HdlTreeProvider(pm as any);
		const providerAny = provider as any;

		providerAny.isRoleGroupedSourcesEnabled = () => true;
		providerAny.isDualHierarchyEnabled = () => false;
		providerAny.isLegacyHierarchyVisibleWithSources = () => true;

		const labels = await getRootLabels(provider);
		assert.deepStrictEqual(labels, ['Sources', 'Module Hierarchy (Legacy)']);
	});

	test('Root nodes include dual hierarchy branches when dualHierarchy is enabled', async () => {
		const dut = createModule('dut', 'dut_root_on.sv');
		const pm = createMockProjectManager([dut]);
		const provider = new HdlTreeProvider(pm as any);
		const providerAny = provider as any;

		providerAny.isRoleGroupedSourcesEnabled = () => true;
		providerAny.isDualHierarchyEnabled = () => true;
		providerAny.isLegacyHierarchyVisibleWithSources = () => false;

		const labels = await getRootLabels(provider);
		assert.deepStrictEqual(labels, ['Sources', 'Design Hierarchy', 'Simulation Hierarchy']);
	});

	test('Legacy Set as Top mapping sends design-like module to Design Top', () => {
		const dut = createModule('dut', 'dut_map_design.sv', false);
		const mapping = mapLegacyTopSelection(dut);
		assert.strictEqual(mapping.designTop, 'dut');
		assert.strictEqual(mapping.simulationTop, undefined);
	});

	test('Legacy Set as Top mapping sends testbench-like module to Simulation Top', () => {
		const tb = createModule('tb_counter', 'tb_map_sim.sv', true);
		const mapping = mapLegacyTopSelection(tb);
		assert.strictEqual(mapping.simulationTop, 'tb_counter');
		assert.strictEqual(mapping.designTop, undefined);
	});

	test('Clear scoped tops falls back to inferred design/simulation roots', async () => {
		const dut = createModule('dut_clear', 'dut_clear.sv');
		const tb = createModule('tb_clear', 'tb_clear.sv', true);
		tb.addInstance(new HdlInstance('dut_clear', 'u_dut', tb.range, tb.fileUri));

		const pm = createMockProjectManager([dut, tb]);
		const provider = new HdlTreeProvider(pm as any);
		provider.setDesignTopModule('dut_clear');
		provider.setSimulationTopModule('tb_clear');
		provider.clearScopedTops();

		const providerAny = provider as any;
		providerAny.getScopedModuleNameSet = async (_kind: string) => new Set(['dut_clear', 'tb_clear']);

		const designChildren = await providerAny.getScopedHierarchyChildren('design');
		const simChildren = await providerAny.getScopedHierarchyChildren('simulation');

		assert.strictEqual((designChildren[0] as any).module.name, 'dut_clear');
		assert.strictEqual((simChildren[0] as any).module.name, 'tb_clear');
	});

	test('Dual hierarchy checklist helper opens checklist when file exists', async () => {
		const opened: string[] = [];
		let fallbackCalls = 0;
		let warningCalls = 0;

		const result = await openDualHierarchyRegressionChecklist({
			workspaceRoot: 'C:/repo',
			existsSync: () => true,
			openChecklist: async (filePath: string) => {
				opened.push(filePath);
			},
			runFallbackDebug: async () => {
				fallbackCalls += 1;
			},
			showWarning: () => {
				warningCalls += 1;
			}
		});

		assert.strictEqual(result, 'opened');
		assert.strictEqual(opened.length, 1);
		assert.strictEqual(fallbackCalls, 0);
		assert.strictEqual(warningCalls, 0);
		assert.ok(opened[0].includes('DUAL_HIERARCHY_MANUAL_REGRESSION.md'));
	});

	test('Dual hierarchy checklist helper falls back to debug when file missing', async () => {
		let openedCalls = 0;
		let fallbackCalls = 0;
		let warningCalls = 0;

		const result = await openDualHierarchyRegressionChecklist({
			workspaceRoot: 'C:/repo',
			existsSync: () => false,
			openChecklist: async () => {
				openedCalls += 1;
			},
			runFallbackDebug: async () => {
				fallbackCalls += 1;
			},
			showWarning: () => {
				warningCalls += 1;
			}
		});

		assert.strictEqual(result, 'fallback');
		assert.strictEqual(openedCalls, 0);
		assert.strictEqual(fallbackCalls, 1);
		assert.strictEqual(warningCalls, 1);
	});

	test('Dual hierarchy checklist path helper returns undefined without workspace root', () => {
		assert.strictEqual(getDualHierarchyChecklistPath(undefined), undefined);
		assert.ok((getDualHierarchyChecklistPath('C:/repo') || '').endsWith('DUAL_HIERARCHY_MANUAL_REGRESSION.md'));
	});

	test('Semantic workbench checklist helper opens checklist when file exists', async () => {
		const opened: string[] = [];
		let fallbackCalls = 0;
		let warningCalls = 0;

		const result = await openSemanticWorkbenchReleaseChecklist({
			workspaceRoot: 'C:/repo',
			existsSync: () => true,
			openChecklist: async (filePath: string) => {
				opened.push(filePath);
			},
			runFallbackGuide: async () => {
				fallbackCalls += 1;
			},
			showWarning: () => {
				warningCalls += 1;
			}
		});

		assert.strictEqual(result, 'opened');
		assert.strictEqual(opened.length, 1);
		assert.strictEqual(fallbackCalls, 0);
		assert.strictEqual(warningCalls, 0);
		assert.ok(opened[0].includes('SEMANTIC_WORKBENCH_RELEASE_CHECKLIST.md'));
	});

	test('Semantic workbench checklist helper falls back to guide when file missing', async () => {
		let openedCalls = 0;
		let fallbackCalls = 0;
		let warningCalls = 0;

		const result = await openSemanticWorkbenchReleaseChecklist({
			workspaceRoot: 'C:/repo',
			existsSync: () => false,
			openChecklist: async () => {
				openedCalls += 1;
			},
			runFallbackGuide: async () => {
				fallbackCalls += 1;
			},
			showWarning: () => {
				warningCalls += 1;
			}
		});

		assert.strictEqual(result, 'fallback');
		assert.strictEqual(openedCalls, 0);
		assert.strictEqual(fallbackCalls, 1);
		assert.strictEqual(warningCalls, 1);
	});

	test('Semantic workbench checklist path helper returns undefined without workspace root', () => {
		assert.strictEqual(getSemanticWorkbenchChecklistPath(undefined), undefined);
		assert.ok((getSemanticWorkbenchChecklistPath('C:/repo') || '').endsWith('SEMANTIC_WORKBENCH_RELEASE_CHECKLIST.md'));
	});

	test('Project config template builder creates required minimal schema fields', () => {
		const dut = createModule('dut_cfg', 'dut_cfg.sv');
		const tb = createModule('tb_cfg', 'tb_cfg.sv', true);
		const template = buildProjectConfigTemplate('C:/repo', [dut, tb], 'repo');

		assert.strictEqual(template.version, '1.0');
		assert.strictEqual(template.name, 'repo');
		assert.ok(template.sourceSets.design.includes.length > 0);
		assert.ok(template.targets.design_default.sourceSets.includes('design'));
		assert.ok(template.targets.sim_default.sourceSets.includes('simulation'));
		assert.ok(template.tops.design);
		assert.ok(template.tops.simulation);
	});

	test('Project config top inference falls back gracefully when no testbench exists', () => {
		const dutOnly = createModule('dut_only', 'dut_only.sv');
		const tops = inferDefaultTops([dutOnly]);
		assert.strictEqual(tops.design, 'dut_only');
		assert.strictEqual(tops.simulation, undefined);
	});

	test('Target context service resolves files from source sets with include and exclude patterns', () => {
		const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hdl-helper-target-context-'));
		const rtlDir = path.join(tempRoot, 'rtl');
		const tbDir = path.join(tempRoot, 'tb');
		fs.mkdirSync(rtlDir, { recursive: true });
		fs.mkdirSync(tbDir, { recursive: true });

		const dutPath = path.join(rtlDir, 'dut.sv');
		const skipPath = path.join(rtlDir, 'skip_internal.sv');
		const tbPath = path.join(tbDir, 'tb_top.sv');
		fs.writeFileSync(dutPath, 'module dut; endmodule\n', 'utf8');
		fs.writeFileSync(skipPath, 'module skip_internal; endmodule\n', 'utf8');
		fs.writeFileSync(tbPath, 'module tb_top; endmodule\n', 'utf8');

		const service = new TargetContextService(tempRoot, {
			projectConfig: {
				version: '1.0',
				name: 'repo',
				root: tempRoot,
				sourceSets: {
					design: {
						name: 'design',
						role: Role.Design,
						includes: ['rtl/**/*.sv'],
						excludes: ['rtl/skip*.sv']
					},
					simulation: {
						name: 'simulation',
						role: Role.Simulation,
						includes: ['tb/**/*.sv', 'rtl/**/*.sv']
					}
				},
				tops: {
					design: 'dut',
					simulation: 'tb_top'
				},
				targets: {
					design_default: {
						id: 'design_default',
						kind: TargetKind.Design,
						top: 'dut',
						sourceSets: ['design']
					},
					sim_default: {
						id: 'sim_default',
						kind: TargetKind.Simulation,
						top: 'tb_top',
						sourceSets: ['simulation']
					}
				},
				activeTarget: 'sim_default'
			}
		});

		const designContext = service.resolveTargetContext('design_default');
		assert.ok(designContext?.resolvedFiles.includes(path.normalize(dutPath)));
		assert.ok(!designContext?.resolvedFiles.includes(path.normalize(skipPath)));
		assert.ok(!designContext?.resolvedFiles.includes(path.normalize(tbPath)));

		const simContext = service.resolveTargetContext('sim_default');
		assert.ok(simContext?.resolvedFiles.includes(path.normalize(dutPath)));
		assert.ok(simContext?.resolvedFiles.includes(path.normalize(tbPath)));

		fs.rmSync(tempRoot, { recursive: true, force: true });
	});

	test('Source set service resolves deterministic union with shared files', () => {
		const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hdl-helper-source-set-union-'));
		const rtlDir = path.join(tempRoot, 'rtl');
		const tbDir = path.join(tempRoot, 'tb');
		const sharedDir = path.join(tempRoot, 'shared');
		fs.mkdirSync(rtlDir, { recursive: true });
		fs.mkdirSync(tbDir, { recursive: true });
		fs.mkdirSync(sharedDir, { recursive: true });

		const dutPath = path.join(rtlDir, 'dut.sv');
		const tbPath = path.join(tbDir, 'tb_top.sv');
		const sharedPath = path.join(sharedDir, 'common_pkg.sv');
		fs.writeFileSync(dutPath, 'module dut; endmodule\n', 'utf8');
		fs.writeFileSync(tbPath, 'module tb_top; endmodule\n', 'utf8');
		fs.writeFileSync(sharedPath, 'package common_pkg; endpackage\n', 'utf8');

		const projectConfig: NormalizedProjectConfig = {
			version: '1.0',
			name: 'repo',
			root: tempRoot,
			sourceSets: {
				design: {
					name: 'design',
					role: Role.Design,
					includes: ['rtl/**/*.sv', 'shared/**/*.sv']
				},
				simulation: {
					name: 'simulation',
					role: Role.Simulation,
					includes: ['tb/**/*.sv', 'shared/**/*.sv']
				}
			},
			tops: {},
			targets: {}
		};

		const service = new SourceSetService(tempRoot, projectConfig);
		const resolved = service.resolveFilesForSourceSets(['simulation', 'design']);

		assert.strictEqual(resolved.length, 3);
		assert.deepStrictEqual(resolved, [...resolved].sort((a, b) => a.localeCompare(b)));
		assert.ok(resolved.includes(path.normalize(dutPath)));
		assert.ok(resolved.includes(path.normalize(tbPath)));
		assert.ok(resolved.includes(path.normalize(sharedPath)));

		fs.rmSync(tempRoot, { recursive: true, force: true });
	});

	test('Source set service exposes primary and secondary roles for shared file', () => {
		const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hdl-helper-source-set-shared-role-'));
		const sharedDir = path.join(tempRoot, 'shared');
		fs.mkdirSync(sharedDir, { recursive: true });
		const sharedPath = path.join(sharedDir, 'common_pkg.sv');
		fs.writeFileSync(sharedPath, 'package common_pkg; endpackage\n', 'utf8');

		const projectConfig: NormalizedProjectConfig = {
			version: '1.0',
			name: 'repo',
			root: tempRoot,
			sourceSets: {
				design: {
					name: 'design',
					role: Role.Design,
					includes: ['shared/**/*.sv']
				},
				simulation: {
					name: 'simulation',
					role: Role.Simulation,
					includes: ['shared/**/*.sv']
				}
			},
			tops: {},
			targets: {}
		};

		const service = new SourceSetService(tempRoot, projectConfig);
		const snapshot = service.getRoleSnapshotForFile(sharedPath);

		assert.ok(snapshot);
		assert.strictEqual(snapshot?.rolePrimary, Role.Design);
		assert.deepStrictEqual(snapshot?.roleSecondary, [Role.Simulation]);
		assert.deepStrictEqual(snapshot?.referencedBySourceSets, ['design', 'simulation']);

		fs.rmSync(tempRoot, { recursive: true, force: true });
	});

	test('Source set service refreshes cache after config update', () => {
		const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hdl-helper-source-set-update-'));
		const rtlDir = path.join(tempRoot, 'rtl');
		fs.mkdirSync(rtlDir, { recursive: true });

		const keepPath = path.join(rtlDir, 'keep.sv');
		const skipPath = path.join(rtlDir, 'skip.sv');
		fs.writeFileSync(keepPath, 'module keep; endmodule\n', 'utf8');
		fs.writeFileSync(skipPath, 'module skip; endmodule\n', 'utf8');

		const baseConfig: NormalizedProjectConfig = {
			version: '1.0',
			name: 'repo',
			root: tempRoot,
			sourceSets: {
				design: {
					name: 'design',
					role: Role.Design,
					includes: ['rtl/**/*.sv']
				}
			},
			tops: {},
			targets: {}
		};

		const updatedConfig: NormalizedProjectConfig = {
			...baseConfig,
			sourceSets: {
				design: {
					name: 'design',
					role: Role.Design,
					includes: ['rtl/**/*.sv'],
					excludes: ['rtl/skip.sv']
				}
			}
		};

		const service = new SourceSetService(tempRoot, baseConfig);
		const first = service.resolveSourceSetFiles('design');
		assert.strictEqual(first.length, 2);

		service.updateProjectConfig(updatedConfig);
		const second = service.resolveSourceSetFiles('design');
		assert.strictEqual(second.length, 1);
		assert.ok(second.includes(path.normalize(keepPath)));
		assert.ok(!second.includes(path.normalize(skipPath)));

		fs.rmSync(tempRoot, { recursive: true, force: true });
	});

	test('Active target context debug snapshot reports heuristic mode when project config is disabled', () => {
		const snapshot = buildTargetContextDebugSnapshot({
			workspaceName: 'repo',
			workspaceRoot: 'C:/repo',
			configEnabled: false,
			configStatus: ProjectConfigStatus.NotEnabled,
			designTop: 'dut_top'
		});

		assert.strictEqual(snapshot.configEnabled, false);
		assert.strictEqual(snapshot.context?.targetId, 'heuristic-fallback');
		assert.ok(snapshot.issues.some(issue => issue.includes('heuristic compatibility mode')));
	});

	test('Active target context debug snapshot resolves config-driven active target', () => {
		const snapshot = buildTargetContextDebugSnapshot({
			workspaceName: 'repo',
			workspaceRoot: 'C:/repo',
			configEnabled: true,
			configStatus: ProjectConfigStatus.Valid,
			projectConfig: {
				version: '1.0',
				name: 'repo',
				root: 'C:/repo',
				sourceSets: {
					design: {
						name: 'design',
						role: Role.Design,
						includes: ['rtl/**/*.sv']
					}
				},
				tops: {
					design: 'dut_top',
					simulation: 'tb_top'
				},
				targets: {
					sim_default: {
						id: 'sim_default',
						kind: TargetKind.Simulation,
						top: 'tb_top',
						sourceSets: ['design']
					}
				},
				activeTarget: 'sim_default'
			}
		});

		assert.strictEqual(snapshot.context?.targetId, 'sim_default');
		assert.strictEqual(snapshot.context?.top, 'tb_top');
		assert.strictEqual(snapshot.issues.some(issue => issue.includes('invalid')), false);
	});

	test('Active target context debug snapshot reports invalid activeTarget fallback', () => {
		const snapshot = buildTargetContextDebugSnapshot({
			workspaceName: 'repo',
			workspaceRoot: 'C:/repo',
			configEnabled: true,
			configStatus: ProjectConfigStatus.Valid,
			projectConfig: {
				version: '1.0',
				name: 'repo',
				root: 'C:/repo',
				sourceSets: {
					design: {
						name: 'design',
						role: Role.Design,
						includes: ['rtl/**/*.sv']
					}
				},
				tops: {
					design: 'dut_top',
					simulation: 'tb_top'
				},
				targets: {
					sim_default: {
						id: 'sim_default',
						kind: TargetKind.Simulation,
						top: 'tb_top',
						sourceSets: ['design']
					}
				},
				activeTarget: 'sim_missing'
			}
		});

		assert.strictEqual(snapshot.fallbackTarget, 'sim_default');
		assert.strictEqual(snapshot.context?.targetId, 'sim_default');
		assert.ok(snapshot.issues.some(issue => issue.includes("activeTarget 'sim_missing' is invalid")));
	});

	test('Config diagnostics builder reports missing project config in enabled mode', () => {
		const issues = buildConfigIssues({
			configEnabled: true,
			status: ProjectConfigStatus.Missing
		});

		assert.ok(issues.some(issue => issue.severity === 'warning'));
		assert.ok(issues.some(issue => issue.message.includes('project.json is missing')));
	});

	test('Config diagnostics builder reports unresolved top for simulation target', () => {
		const issues = buildConfigIssues({
			configEnabled: true,
			status: ProjectConfigStatus.Valid,
			config: {
				version: '1.0',
				name: 'repo',
				root: 'C:/repo',
				sourceSets: {
					design: {
						name: 'design',
						role: Role.Design,
						includes: ['rtl/**/*.sv']
					}
				},
				tops: {
					design: 'dut_top',
					simulation: undefined
				},
				targets: {
					sim_default: {
						id: 'sim_default',
						kind: TargetKind.Simulation,
						sourceSets: ['design']
					}
				},
				activeTarget: 'sim_default'
			}
		});

		assert.ok(issues.some(issue => issue.message.includes("Target 'sim_default' has no resolved top.")));
	});

	test('Config diagnostics builder reports empty resolved files, missing filelist, missing files and unknown profile', () => {
		const issues = buildConfigIssues({
			configEnabled: true,
			status: ProjectConfigStatus.Valid,
			config: {
				version: '1.0',
				name: 'repo',
				root: 'C:/repo',
				sourceSets: {
					design: {
						name: 'design',
						role: Role.Design,
						includes: ['rtl/**/*.sv']
					}
				},
				tops: {
					design: 'dut_top',
					simulation: 'tb_top'
				},
				targets: {
					sim_empty: {
						id: 'sim_empty',
						kind: TargetKind.Simulation,
						top: 'tb_top',
						sourceSets: ['design'],
						filelist: 'missing/sim.f',
						toolProfile: 'profile-unknown'
					},
					sim_missing: {
						id: 'sim_missing',
						kind: TargetKind.Simulation,
						top: 'tb_top',
						sourceSets: ['design']
					}
				},
				activeTarget: 'sim_empty'
			},
			targetContexts: {
				sim_empty: {
					targetId: 'sim_empty',
					kind: TargetKind.Simulation,
					top: 'tb_top',
					resolvedFiles: [],
					includeDirs: [],
					defines: {},
					constraints: [],
					scripts: [],
					sourceSets: ['design']
				},
				sim_missing: {
					targetId: 'sim_missing',
					kind: TargetKind.Simulation,
					top: 'tb_top',
					resolvedFiles: ['C:/repo/rtl/missing_file.sv'],
					includeDirs: [],
					defines: {},
					constraints: [],
					scripts: [],
					sourceSets: ['design']
				}
			},
			knownToolProfiles: ['profile-fast'],
			resolvePath: filePath => `C:/repo/${filePath}`,
			fileExists: filePath => !filePath.includes('missing')
		});

		assert.ok(issues.some(issue => issue.message.includes("Target 'sim_empty' has empty resolved files.")));
		assert.ok(issues.some(issue => issue.message.includes("Target 'sim_empty' references missing filelist")));
		assert.ok(issues.some(issue => issue.message.includes("Target 'sim_empty' references unknown tool profile")));
		assert.ok(issues.some(issue => issue.message.includes("Target 'sim_missing' has 1 missing resolved file(s)")));
	});

	test('Project config integrity script passes for valid source-set and target resolution', () => {
		const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hdl-helper-integrity-pass-'));
		const configDir = path.join(tempRoot, '.hdl-helper');
		const rtlDir = path.join(tempRoot, 'rtl');
		const filelistDir = path.join(tempRoot, 'sim');
		const scriptPath = path.resolve(__dirname, '..', '..', 'scripts', 'check-project-config-integrity.cjs');

		fs.mkdirSync(configDir, { recursive: true });
		fs.mkdirSync(rtlDir, { recursive: true });
		fs.mkdirSync(filelistDir, { recursive: true });
		fs.writeFileSync(path.join(rtlDir, 'dut.sv'), 'module dut; endmodule\n', 'utf8');
		fs.writeFileSync(path.join(filelistDir, 'sim.f'), 'rtl/dut.sv\n', 'utf8');
		fs.writeFileSync(path.join(configDir, 'project.json'), JSON.stringify({
			version: '1.0',
			name: 'repo',
			sourceSets: {
				design: {
					role: 'design',
					includes: ['rtl/**/*.sv']
				}
			},
			targets: {
				sim_default: {
					kind: 'simulation',
					sourceSets: ['design'],
					filelist: 'sim/sim.f'
				}
			}
		}, null, 2), 'utf8');

		const output = cp.execFileSync(process.execPath, [scriptPath], {
			cwd: tempRoot,
			encoding: 'utf8'
		});

		assert.ok(output.includes('Integrity check passed.'));
		fs.rmSync(tempRoot, { recursive: true, force: true });
	});

	test('Project config integrity script fails for zero-match source set and empty target files', () => {
		const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hdl-helper-integrity-fail-'));
		const configDir = path.join(tempRoot, '.hdl-helper');
		const scriptPath = path.resolve(__dirname, '..', '..', 'scripts', 'check-project-config-integrity.cjs');

		fs.mkdirSync(configDir, { recursive: true });
		fs.writeFileSync(path.join(configDir, 'project.json'), JSON.stringify({
			version: '1.0',
			name: 'repo',
			sourceSets: {
				design: {
					role: 'design',
					includes: ['rtl/**/*.sv']
				}
			},
			targets: {
				sim_default: {
					kind: 'simulation',
					sourceSets: ['design']
				}
			}
		}, null, 2), 'utf8');

		assert.throws(() => {
			cp.execFileSync(process.execPath, [scriptPath], {
				cwd: tempRoot,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe']
			});
		}, /resolves to zero files|resolves empty files from sourceSets/);

		fs.rmSync(tempRoot, { recursive: true, force: true });
	});

	test('Regression fixture matrix script validates fixture directories, checklist tokens and artifact contracts', () => {
		const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hdl-helper-fixture-matrix-'));
		const fixtureRoot = path.join(tempRoot, 'resources', 'regression', 'fixtures');
		const scriptPath = path.resolve(__dirname, '..', '..', 'scripts', 'check-regression-fixture-matrix.cjs');

		const fixtureNames = [
			'pure_rtl_project',
			'rtl_tb_sva_project',
			'multi_top_project',
			'heuristic_only_project',
			'shared_file_project',
			'filelist_narrow_project'
		];

		for (const fixtureName of fixtureNames) {
			const fixtureDir = path.join(fixtureRoot, fixtureName);
			fs.mkdirSync(fixtureDir, { recursive: true });
			fs.writeFileSync(path.join(fixtureDir, 'README.md'), [
				'# fixture',
				'- sources grouping',
				'- hierarchy roots',
				'- target context resolution',
				'- run resolution',
				'- diagnostics behavior'
			].join('\n'), 'utf8');
		}

		const createFixtureFile = (fixtureName: string, relativePath: string, content: string) => {
			const filePath = path.join(fixtureRoot, fixtureName, relativePath);
			fs.mkdirSync(path.dirname(filePath), { recursive: true });
			fs.writeFileSync(filePath, content, 'utf8');
		};

		createFixtureFile('pure_rtl_project', 'rtl/dut.sv', 'module dut; endmodule\n');
		createFixtureFile('pure_rtl_project', '.hdl-helper/project.json', '{"version":"1.0"}\n');

		createFixtureFile('rtl_tb_sva_project', 'rtl/dut.sv', 'module dut; endmodule\n');
		createFixtureFile('rtl_tb_sva_project', 'tb/tb_top.sv', 'module tb_top; endmodule\n');
		createFixtureFile('rtl_tb_sva_project', 'sva/handshake_sva.sv', 'module handshake_sva; endmodule\n');
		createFixtureFile('rtl_tb_sva_project', '.hdl-helper/project.json', '{"version":"1.0"}\n');

		createFixtureFile('multi_top_project', 'rtl/core_a.sv', 'module core_a; endmodule\n');
		createFixtureFile('multi_top_project', 'rtl/core_b.sv', 'module core_b; endmodule\n');
		createFixtureFile('multi_top_project', 'tb/tb_a.sv', 'module tb_a; endmodule\n');
		createFixtureFile('multi_top_project', 'tb/tb_b.sv', 'module tb_b; endmodule\n');
		createFixtureFile('multi_top_project', '.hdl-helper/project.json', '{"version":"1.0"}\n');

		createFixtureFile('heuristic_only_project', 'rtl/dut.sv', 'module dut; endmodule\n');
		createFixtureFile('heuristic_only_project', 'tb/tb_top.sv', 'module tb_top; endmodule\n');

		createFixtureFile('shared_file_project', 'common/bus_pkg.sv', 'package bus_pkg; endpackage\n');
		createFixtureFile('shared_file_project', 'rtl/dut.sv', 'module dut; endmodule\n');
		createFixtureFile('shared_file_project', 'tb/tb_shared.sv', 'module tb_shared; endmodule\n');
		createFixtureFile('shared_file_project', '.hdl-helper/project.json', '{"version":"1.0"}\n');

		createFixtureFile('filelist_narrow_project', 'rtl/dut.sv', 'module dut; endmodule\n');
		createFixtureFile('filelist_narrow_project', 'rtl/debug_stub.sv', 'module debug_stub; endmodule\n');
		createFixtureFile('filelist_narrow_project', 'tb/tb_top.sv', 'module tb_top; endmodule\n');
		createFixtureFile('filelist_narrow_project', 'sim/sim.f', 'rtl/dut.sv\n');
		createFixtureFile('filelist_narrow_project', '.hdl-helper/project.json', '{"version":"1.0"}\n');

		const output = cp.execFileSync(process.execPath, [scriptPath], {
			cwd: tempRoot,
			encoding: 'utf8'
		});

		assert.ok(output.includes('Fixture matrix check passed.'));
		fs.rmSync(tempRoot, { recursive: true, force: true });
	});

	test('Fixture sanity report script validates seeded fixture set and writes report', () => {
		const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hdl-helper-fixture-sanity-'));
		const fixtureRoot = path.join(tempRoot, 'resources', 'regression', 'fixtures');
		const scriptPath = path.resolve(__dirname, '..', '..', 'scripts', 'run-fixture-sanity-report.cjs');

		const fixtureNames = [
			'pure_rtl_project',
			'rtl_tb_sva_project',
			'multi_top_project',
			'heuristic_only_project',
			'shared_file_project',
			'filelist_narrow_project'
		];

		for (const fixtureName of fixtureNames) {
			const fixtureDir = path.join(fixtureRoot, fixtureName);
			fs.mkdirSync(fixtureDir, { recursive: true });
			if (fixtureName === 'heuristic_only_project') {
				continue;
			}

			const rtlDir = path.join(fixtureDir, 'rtl');
			const configDir = path.join(fixtureDir, '.hdl-helper');
			fs.mkdirSync(rtlDir, { recursive: true });
			fs.mkdirSync(configDir, { recursive: true });
			fs.writeFileSync(path.join(rtlDir, 'dut.sv'), 'module dut; endmodule\n', 'utf8');
			fs.writeFileSync(path.join(configDir, 'project.json'), JSON.stringify({
				version: '1.0',
				name: fixtureName,
				sourceSets: {
					design: {
						role: 'design',
						includes: ['rtl/**/*.sv']
					}
				},
				targets: {
					sim_default: {
						kind: 'simulation',
						sourceSets: ['design']
					}
				}
			}, null, 2), 'utf8');
		}

		const output = cp.execFileSync(process.execPath, [scriptPath], {
			cwd: tempRoot,
			encoding: 'utf8'
		});

		const reportPath = path.join(tempRoot, 'resources', 'regression', 'FIXTURE_SANITY_REPORT_2026-04-12.md');
		assert.ok(output.includes('Fixture sanity passed.'));
		assert.ok(fs.existsSync(reportPath));

		const reportContent = fs.readFileSync(reportPath, 'utf8');
		assert.ok(reportContent.includes('Overall: passed'));
		fs.rmSync(tempRoot, { recursive: true, force: true });
	});

	test('Debug commands sanity report script validates command wiring and writes report', () => {
		const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hdl-helper-debug-sanity-'));
		const packagePath = path.join(tempRoot, 'package.json');
		const extensionPath = path.join(tempRoot, 'src', 'extension.ts');
		const testsPath = path.join(tempRoot, 'src', 'test', 'extension.test.ts');
		const reportDir = path.join(tempRoot, 'resources', 'regression');
		const scriptPath = path.resolve(__dirname, '..', '..', 'scripts', 'run-debug-commands-sanity-report.cjs');

		fs.mkdirSync(path.dirname(extensionPath), { recursive: true });
		fs.mkdirSync(path.dirname(testsPath), { recursive: true });
		fs.mkdirSync(reportDir, { recursive: true });

		fs.writeFileSync(packagePath, JSON.stringify({
			contributes: {
				commands: [
					{ command: 'hdl-helper.debugProjectClassification' },
					{ command: 'hdl-helper.debugActiveTargetContext' },
					{ command: 'hdl-helper.debugRecentRunsByTarget' },
					{ command: 'hdl-helper.debugToolchainHealthByProfile' }
				]
			}
		}, null, 2), 'utf8');

		fs.writeFileSync(extensionPath, [
			"registerCommand('hdl-helper.debugProjectClassification'",
			"registerCommand('hdl-helper.debugActiveTargetContext'",
			"registerCommand('hdl-helper.debugRecentRunsByTarget'",
			"registerCommand('hdl-helper.debugToolchainHealthByProfile'"
		].join('\n'), 'utf8');

		fs.writeFileSync(testsPath, [
			'buildClassificationDebugSections',
			'Active target context debug snapshot reports invalid activeTarget fallback',
			'formatRunRecords(',
			'buildToolchainStatusForProfile'
		].join('\n'), 'utf8');

		const output = cp.execFileSync(process.execPath, [scriptPath], {
			cwd: tempRoot,
			encoding: 'utf8'
		});

		const reportPath = path.join(reportDir, 'DEBUG_COMMANDS_SANITY_REPORT_2026-04-12.md');
		assert.ok(output.includes('Debug command sanity passed.'));
		assert.ok(fs.existsSync(reportPath));

		const reportContent = fs.readFileSync(reportPath, 'utf8');
		assert.ok(reportContent.includes('Overall: passed'));
		fs.rmSync(tempRoot, { recursive: true, force: true });
	});

	test('Fixture validation report script validates fixture checklist dimensions and writes report', () => {
		const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hdl-helper-fixture-validation-'));
		const fixtureRoot = path.join(tempRoot, 'resources', 'regression', 'fixtures');
		const scriptPath = path.resolve(__dirname, '..', '..', 'scripts', 'run-fixture-validation-report.cjs');

		const fixtureNames = [
			'pure_rtl_project',
			'rtl_tb_sva_project',
			'multi_top_project',
			'heuristic_only_project',
			'shared_file_project',
			'filelist_narrow_project'
		];

		const createFile = (fixtureName: string, relativePath: string, content: string) => {
			const filePath = path.join(fixtureRoot, fixtureName, relativePath);
			fs.mkdirSync(path.dirname(filePath), { recursive: true });
			fs.writeFileSync(filePath, content, 'utf8');
		};

		for (const fixtureName of fixtureNames) {
			if (fixtureName === 'heuristic_only_project') {
				createFile(fixtureName, 'rtl/dut.sv', 'module dut; endmodule\n');
				createFile(fixtureName, 'tb/tb_top.sv', 'module tb_top; endmodule\n');
				continue;
			}

			createFile(fixtureName, 'rtl/dut.sv', 'module dut; endmodule\n');
			createFile(fixtureName, '.hdl-helper/project.json', JSON.stringify({
				version: '1.0',
				name: fixtureName,
				tops: {
					design: 'dut',
					simulation: 'tb_top'
				},
				sourceSets: {
					design: {
						role: 'design',
						includes: ['rtl/**/*.sv']
					}
				},
				targets: {
					sim_default: {
						kind: 'simulation',
						sourceSets: ['design']
					}
				}
			}, null, 2));
		}

		createFile('rtl_tb_sva_project', 'tb/tb_top.sv', 'module tb_top; endmodule\n');
		createFile('multi_top_project', 'tb/tb_top.sv', 'module tb_top; endmodule\n');
		createFile('shared_file_project', 'tb/tb_top.sv', 'module tb_top; endmodule\n');
		createFile('filelist_narrow_project', 'tb/tb_top.sv', 'module tb_top; endmodule\n');

		const output = cp.execFileSync(process.execPath, [scriptPath], {
			cwd: tempRoot,
			encoding: 'utf8'
		});

		const reportPath = path.join(tempRoot, 'resources', 'regression', 'FIXTURE_VALIDATION_REPORT_2026-04-12.md');
		assert.ok(output.includes('Fixture validation passed.'));
		assert.ok(fs.existsSync(reportPath));

		const reportContent = fs.readFileSync(reportPath, 'utf8');
		assert.ok(reportContent.includes('Overall: passed'));
		fs.rmSync(tempRoot, { recursive: true, force: true });
	});

	test('Semantic workbench signoff script validates evidence reports and writes ready status', () => {
		const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hdl-helper-signoff-'));
		const regressionRoot = path.join(tempRoot, 'resources', 'regression');
		const scriptPath = path.resolve(__dirname, '..', '..', 'scripts', 'run-semantic-workbench-signoff-report.cjs');

		fs.mkdirSync(regressionRoot, { recursive: true });
		fs.writeFileSync(path.join(regressionRoot, 'FIXTURE_SANITY_REPORT_2026-04-12.md'), 'Overall: passed\n', 'utf8');
		fs.writeFileSync(path.join(regressionRoot, 'DEBUG_COMMANDS_SANITY_REPORT_2026-04-12.md'), 'Overall: passed\n', 'utf8');
		fs.writeFileSync(path.join(regressionRoot, 'FIXTURE_VALIDATION_REPORT_2026-04-12.md'), 'Overall: passed\n', 'utf8');
		fs.writeFileSync(path.join(tempRoot, 'RELEASE_NOTES_V3.2.0.md'), 'Semantic Workbench Gate Status (2026-04-12)\n', 'utf8');

		const output = cp.execFileSync(process.execPath, [scriptPath], {
			cwd: tempRoot,
			encoding: 'utf8'
		});

		const reportPath = path.join(regressionRoot, 'SEMANTIC_WORKBENCH_SIGNOFF_2026-04-12.md');
		assert.ok(output.includes('Signoff checks passed.'));
		assert.ok(fs.existsSync(reportPath));

		const reportContent = fs.readFileSync(reportPath, 'utf8');
		assert.ok(reportContent.includes('Final status: ready'));
		fs.rmSync(tempRoot, { recursive: true, force: true });
	});

	test('Toolchain profile collector returns sorted deduplicated profile list', () => {
		const profiles = collectToolchainProfileNames({
			version: '1.0',
			name: 'repo',
			root: 'C:/repo',
			sourceSets: {
				design: {
					name: 'design',
					role: Role.Design,
					includes: ['rtl/**/*.sv']
				}
			},
			tops: {
				design: 'dut',
				simulation: 'tb'
			},
			targets: {
				sim_a: {
					id: 'sim_a',
					kind: TargetKind.Simulation,
					sourceSets: ['design'],
					toolProfile: 'xsim'
				},
				sim_b: {
					id: 'sim_b',
					kind: TargetKind.Simulation,
					sourceSets: ['design'],
					toolProfile: 'iverilog'
				},
				sim_c: {
					id: 'sim_c',
					kind: TargetKind.Simulation,
					sourceSets: ['design'],
					toolProfile: 'xsim'
				}
			},
			activeTarget: 'sim_a'
		});

		assert.deepStrictEqual(profiles, ['default', 'iverilog', 'xsim']);
	});

	test('Toolchain status builder marks missing tools correctly', () => {
		const status = buildToolchainStatusForProfile('xsim', [
			{ id: 'iverilog', label: 'iverilog', command: 'iverilog', available: true },
			{ id: 'vvp', label: 'vvp', command: 'vvp', available: false },
			{ id: 'verible-lint', label: 'verible-verilog-lint', command: 'verible-verilog-lint', available: false }
		], 1234);

		assert.strictEqual(status.profile, 'xsim');
		assert.strictEqual(status.available, false);
		assert.deepStrictEqual(status.missingTools, ['verible-verilog-lint', 'vvp']);
		assert.strictEqual(status.lastChecked, 1234);
	});

	test('Toolchain probe resolver maps profile-specific required probe ids', () => {
		assert.deepStrictEqual(resolveToolchainProbeIdsForProfile('xsim'), ['vivado', 'xvlog', 'xelab', 'xsim']);
		assert.deepStrictEqual(resolveToolchainProbeIdsForProfile('iverilog'), ['iverilog', 'vvp']);
		assert.deepStrictEqual(resolveToolchainProbeIdsForProfile('questa'), ['vlog', 'vsim']);
		assert.deepStrictEqual(resolveToolchainProbeIdsForProfile('unknown-profile'), ['iverilog', 'vvp', 'verible-lint', 'verible-ls']);
	});

	test('Toolchain profile probe map normalizer merges custom overrides', () => {
		const map = normalizeToolchainProfileProbeMap({
			default: ['iverilog'],
			xsim: ['xsim', 'xelab'],
			CustomFlow: ['my-tool', 'my-tool', 'helper']
		});

		assert.deepStrictEqual(map.default, ['iverilog']);
		assert.deepStrictEqual(map.xsim, ['xsim', 'xelab']);
		assert.deepStrictEqual(map.customflow, ['my-tool', 'helper']);
	});

	test('Toolchain probe resolver supports custom profile map overrides', () => {
		const map = normalizeToolchainProfileProbeMap({
			customsim: ['custom-compile', 'custom-run']
		});

		assert.deepStrictEqual(
			resolveToolchainProbeIdsForProfile('customsim', map),
			['custom-compile', 'custom-run']
		);
	});

	test('Toolchain health profile arg resolver supports string and object payloads', () => {
		assert.strictEqual(resolveToolchainHealthProfileArg(' xsim '), 'xsim');
		assert.strictEqual(resolveToolchainHealthProfileArg({ profile: '  questa  ' }), 'questa');
		assert.strictEqual(resolveToolchainHealthProfileArg({}), undefined);
		assert.strictEqual(resolveToolchainHealthProfileArg('   '), undefined);
	});

	test('Toolchain probe selector injects unavailable fallback probes for required ids', () => {
		const selected = selectToolchainProbesForProfile('xsim', [
			{ id: 'vivado', label: 'vivado', command: 'vivado', available: true },
			{ id: 'xvlog', label: 'xvlog', command: 'xvlog', available: true }
		]);

		assert.deepStrictEqual(selected.map(probe => probe.id), ['vivado', 'xvlog', 'xelab', 'xsim']);
		assert.strictEqual(selected[2].available, false);
		assert.strictEqual(selected[3].available, false);
	});

	test('Toolchain diagnostics builder returns info entry when no snapshot exists', () => {
		const entries = buildToolchainStatusDiagnosticsEntries({});

		assert.strictEqual(entries.length, 1);
		assert.strictEqual(entries[0].severity, 'info');
		assert.ok(entries[0].message.includes('not collected yet'));
	});

	test('Toolchain diagnostics builder renders sorted warning/pass entries', () => {
		const entries = buildToolchainStatusDiagnosticsEntries({
			xsim: {
				profile: 'xsim',
				available: false,
				missingTools: ['vvp'],
				lastChecked: 1000
			},
			iverilog: {
				profile: 'iverilog',
				available: true,
				missingTools: [],
				lastChecked: 2000
			}
		});

		assert.strictEqual(entries.length, 2);
		assert.ok(entries[0].message.includes("'iverilog'"));
		assert.strictEqual(entries[0].severity, 'pass');
		assert.ok(entries[1].message.includes("'xsim'"));
		assert.strictEqual(entries[1].severity, 'warning');
		assert.ok(entries[1].message.includes('vvp'));
	});

	test('Open project config helper opens existing config file', async () => {
		const opened: string[] = [];
		let createCalls = 0;
		let warningCalls = 0;

		const result = await openProjectConfig({
			workspaceRoot: 'C:/repo',
			existsSync: () => true,
			openConfig: async (filePath: string) => {
				opened.push(filePath);
			},
			runCreate: async () => {
				createCalls += 1;
			},
			showWarning: () => {
				warningCalls += 1;
			}
		});

		assert.strictEqual(result, 'opened');
		assert.strictEqual(opened.length, 1);
		assert.strictEqual(createCalls, 0);
		assert.strictEqual(warningCalls, 0);
		assert.ok((opened[0] || '').endsWith('project.json'));
		assert.ok((getProjectConfigPath('C:/repo') || '').endsWith('project.json'));
	});

	test('Open project config helper creates template when config file is missing', async () => {
		let openCalls = 0;
		let createCalls = 0;
		let warningCalls = 0;

		const result = await openProjectConfig({
			workspaceRoot: 'C:/repo',
			existsSync: () => false,
			openConfig: async () => {
				openCalls += 1;
			},
			runCreate: async () => {
				createCalls += 1;
			},
			showWarning: () => {
				warningCalls += 1;
			}
		});

		assert.strictEqual(result, 'created');
		assert.strictEqual(openCalls, 0);
		assert.strictEqual(createCalls, 1);
		assert.strictEqual(warningCalls, 1);
	});

	test('Simulation tasks file path resolver handles relative and absolute paths', () => {
		const normalize = (value: string) => value.replace(/\\/g, '/');
		assert.strictEqual(
			normalize(getSimulationTasksFilePath('C:/repo', '.vscode/hdl_tasks.json')),
			'C:/repo/.vscode/hdl_tasks.json'
		);
		assert.strictEqual(
			normalize(getSimulationTasksFilePath('C:/repo', 'D:/workspace/custom_tasks.json')),
			'D:/workspace/custom_tasks.json'
		);
	});

	test('Open simulation tasks helper opens existing file', async () => {
		const opened: string[] = [];
		let writeCalls = 0;

		const result = await openSimulationTasksFile({
			workspaceRoot: 'C:/repo',
			configuredTasksFile: '.vscode/hdl_tasks.json',
			existsSync: () => true,
			writeFile: async () => {
				writeCalls += 1;
			},
			openFile: async (filePath: string) => {
				opened.push(filePath);
			}
		});

		assert.strictEqual(result, 'opened');
		assert.strictEqual(writeCalls, 0);
		assert.strictEqual(opened.length, 1);
		assert.ok((opened[0] || '').replace(/\\/g, '/').endsWith('.vscode/hdl_tasks.json'));
	});

	test('Open simulation tasks helper creates template when missing', async () => {
		const opened: string[] = [];
		const written: string[] = [];
		let ensureCalls = 0;

		const result = await openSimulationTasksFile({
			workspaceRoot: 'C:/repo',
			configuredTasksFile: '.vscode/hdl_tasks.json',
			existsSync: () => false,
			ensureDir: () => {
				ensureCalls += 1;
			},
			writeFile: async (_filePath: string, content: string) => {
				written.push(content);
			},
			openFile: async (filePath: string) => {
				opened.push(filePath);
			},
			showInfo: () => {
				// no-op
			}
		});

		assert.strictEqual(result, 'created');
		assert.strictEqual(ensureCalls, 1);
		assert.strictEqual(written.length, 1);
		assert.ok((written[0] || '').includes('"tasks"'));
		assert.strictEqual(opened.length, 1);
	});

	test('Active target simulation fallback top prefers simulation top', () => {
		assert.strictEqual(resolveFallbackSimulationTop('dut_top', 'tb_top'), 'tb_top');
		assert.strictEqual(resolveFallbackSimulationTop('dut_top', undefined), 'dut_top');
		assert.strictEqual(resolveFallbackSimulationTop(undefined, undefined), undefined);
	});

	test('Active target simulation fallback warning includes target id when available', () => {
		assert.ok(buildConfigFallbackWarning('sim_default').includes("sim_default"));
		assert.ok(buildConfigFallbackWarning(undefined).includes('Unable to resolve active target context'));
	});

	test('Active target simulation builds context-driven task with filelist', () => {
		const task = buildContextDrivenSimTask({
			targetId: 'sim_default',
			kind: TargetKind.Simulation,
			top: 'tb_top',
			resolvedFiles: ['C:/repo/tb/tb_top.sv'],
			includeDirs: ['rtl/include'],
			defines: { FOO: '1' },
			constraints: [],
			scripts: [],
			filelist: '.vscode/sim.f',
			sourceSets: ['simulation']
		});

		assert.strictEqual(task?.name, 'Simulate sim_default');
		assert.strictEqual(task?.top, 'tb_top');
		assert.strictEqual(task?.filelist, '.vscode/sim.f');
		assert.deepStrictEqual(task?.sources, ['C:/repo/tb/tb_top.sv']);
		assert.deepStrictEqual(task?.includeDirs, ['rtl/include']);
		assert.deepStrictEqual(task?.defines, { FOO: '1' });
	});

	test('Active target run target id resolver uses heuristic top fallback', () => {
		assert.strictEqual(resolveRunTargetId('sim_default', 'tb_top'), 'sim_default');
		assert.strictEqual(resolveRunTargetId('heuristic-fallback', 'tb_top'), 'heuristic:tb_top');
		assert.strictEqual(resolveRunTargetId(undefined, 'tb_top'), 'heuristic:tb_top');
	});

	test('Runs service resolves heuristic run target id by simulation then design top', () => {
		assert.strictEqual(resolveHeuristicRunTargetId({
			'heuristic:tb_top': {
				targetId: 'heuristic:tb_top',
				timestamp: 1,
				success: true
			}
		}, 'dut_top', 'tb_top'), 'heuristic:tb_top');

		assert.strictEqual(resolveHeuristicRunTargetId({
			'heuristic:dut_top': {
				targetId: 'heuristic:dut_top',
				timestamp: 1,
				success: true
			}
		}, 'dut_top', undefined), 'heuristic:dut_top');
	});

	test('Runs service write helper forwards record to state service', async () => {
		let writtenTargetId = '';
		let writtenRecord: any;

		const fakeState = {
			setLastRunForTarget: async (targetId: string, record: any) => {
				writtenTargetId = targetId;
				writtenRecord = record;
			}
		} as any;

		await writeRunRecordForTarget(fakeState, 'sim_default', {
			top: 'tb_top',
			taskName: 'Simulate sim_default',
			success: true,
			logPath: 'C:/repo/build/tb_top.run.log'
		});

		assert.strictEqual(writtenTargetId, 'sim_default');
		assert.strictEqual(writtenRecord.targetId, 'sim_default');
		assert.strictEqual(writtenRecord.top, 'tb_top');
		assert.strictEqual(writtenRecord.success, true);
		assert.strictEqual(writtenRecord.logPath, 'C:/repo/build/tb_top.run.log');
		assert.ok(typeof writtenRecord.timestamp === 'number');
	});

	test('Recent runs formatter returns fallback line for empty records', () => {
		const lines = formatRunRecords({});
		assert.deepStrictEqual(lines, ['No run records available.']);
	});

	test('Recent runs formatter includes target and success fields', () => {
		const lines = formatRunRecords({
			sim_default: {
				targetId: 'sim_default',
				top: 'tb_top',
				timestamp: 1000,
				success: true,
				taskName: 'Simulate tb_top',
				waveformPath: 'C:/repo/build/tb_top.fst',
				buildDir: 'C:/repo/build'
			}
		});

		assert.ok(lines.some(line => line.includes('Target: sim_default')));
		assert.ok(lines.some(line => line.includes('Success: true')));
		assert.ok(lines.some(line => line.includes('Top: tb_top')));
		assert.ok(lines.some(line => line.includes('Waveform: C:/repo/build/tb_top.fst')));
	});

	test('Recent runs formatter includes failure type for failed records', () => {
		const lines = formatRunRecords({
			sim_default: {
				targetId: 'sim_default',
				timestamp: 1000,
				success: false,
				failureType: 'compile',
				taskName: 'Simulate tb_top'
			}
		});

		assert.ok(lines.some(line => line.includes('FailureType: compile')));
	});

	test('Rerun top resolver prefers explicit top field', () => {
		const top = resolveRerunTop({
			targetId: 'sim_default',
			timestamp: 123,
			success: true,
			top: 'tb_top',
			taskName: 'Simulate ignored_top'
		});

		assert.strictEqual(top, 'tb_top');
	});

	test('Rerun top resolver falls back to simulate task name', () => {
		const top = resolveRerunTop({
			targetId: 'sim_default',
			timestamp: 123,
			success: true,
			taskName: 'Simulate tb_counter'
		});

		assert.strictEqual(top, 'tb_counter');
	});

	test('Rerun top resolver returns undefined when no top info exists', () => {
		const top = resolveRerunTop({
			targetId: 'sim_default',
			timestamp: 123,
			success: true,
			taskName: 'Build tb_counter'
		});

		assert.strictEqual(top, undefined);
	});

	test('Rerun target arg resolver supports string and object arg', () => {
		assert.strictEqual(resolveTargetIdFromRerunArg('sim_default'), 'sim_default');
		assert.strictEqual(resolveTargetIdFromRerunArg({ targetId: 'design_default' }), 'design_default');
		assert.strictEqual(resolveTargetIdFromRerunArg({ targetId: '   ' }), undefined);
		assert.strictEqual(resolveTargetIdFromRerunArg(undefined), undefined);
	});

	test('Pick run record helper returns undefined when target id is missing', () => {
		const record = pickRunRecordForTarget({}, undefined);
		assert.strictEqual(record, undefined);
	});

	test('Pick run record helper returns matching target record', () => {
		const record = pickRunRecordForTarget({
			sim_default: {
				targetId: 'sim_default',
				timestamp: 123,
				success: true
			}
		}, 'sim_default');

		assert.strictEqual(record?.targetId, 'sim_default');
		assert.strictEqual(record?.success, true);
	});

	test('Get log path helper returns undefined for missing record', () => {
		assert.strictEqual(getLogPathFromRunRecord(undefined), undefined);
	});

	test('Get log path helper returns log path from run record', () => {
		const logPath = getLogPathFromRunRecord({
			targetId: 'sim_default',
			timestamp: 123,
			success: true,
			logPath: 'C:/repo/build/tb_top.run.log'
		});

		assert.strictEqual(logPath, 'C:/repo/build/tb_top.run.log');
	});

	test('Recent runs entries helper sorts by timestamp descending', () => {
		const entries = getRecentRunEntries({
			old_target: {
				targetId: 'old_target',
				timestamp: 100,
				success: true
			},
			new_target: {
				targetId: 'new_target',
				timestamp: 200,
				success: false
			}
		});

		assert.strictEqual(entries[0].targetId, 'new_target');
		assert.strictEqual(entries[1].targetId, 'old_target');
	});

	test('Recent runs actions helper returns waveform and log actions when paths exist', () => {
		const actions = getRecentRunActions({
			targetId: 'sim_default',
			timestamp: 100,
			success: true,
			waveformPath: 'C:/repo/build/tb_top.fst',
			logPath: 'C:/repo/build/tb_top.run.log'
		});

		assert.deepStrictEqual(actions, ['Open Waveform', 'Open Log']);
	});

	test('Recent runs picker description includes failure type when failed', () => {
		const entries = getRecentRunEntries({
			sim_default: {
				targetId: 'sim_default',
				timestamp: 100,
				success: false,
				failureType: 'runtime'
			}
		});

		const description = entries[0].record.success
			? 'success'
			: `failed (${entries[0].record.failureType || 'unknown'})`;

		assert.strictEqual(description, 'failed (runtime)');
	});

	test('Recent runs helper prioritizes active target at top', () => {
		const entries = getRecentRunEntries({
			sim_default: {
				targetId: 'sim_default',
				timestamp: 200,
				success: true
			},
			design_default: {
				targetId: 'design_default',
				timestamp: 300,
				success: true
			}
		});

		const prioritized = prioritizeActiveTarget(entries, 'sim_default');
		assert.strictEqual(prioritized[0].targetId, 'sim_default');
		assert.strictEqual(prioritized[1].targetId, 'design_default');
	});

	test('Artifact action helper returns both actions when files are available', () => {
		const actions = getAvailableArtifactActions({
			targetId: 'sim_default',
			timestamp: 123,
			success: true,
			waveformPath: 'C:/repo/build/tb_top.fst',
			logPath: 'C:/repo/build/tb_top.run.log'
		}, () => true);

		assert.deepStrictEqual(actions, ['Open Waveform', 'Open Log']);
	});

	test('Artifact missing helper reports missing record context', () => {
		const reasons = getMissingArtifactReasons(undefined);
		assert.ok(reasons.some(reason => reason.includes('No run record matched')));
	});

	test('Artifact missing helper reports missing waveform and log files', () => {
		const reasons = getMissingArtifactReasons({
			targetId: 'sim_default',
			timestamp: 123,
			success: true,
			waveformPath: 'C:/repo/build/tb_top.fst',
			logPath: 'C:/repo/build/tb_top.run.log'
		}, () => false);

		assert.ok(reasons.some(reason => reason.includes('Waveform file not found')));
		assert.ok(reasons.some(reason => reason.includes('Log file not found')));
	});

	test('Run record picker returns undefined for unknown target', () => {
		const record = pickRunRecordByTarget({}, 'unknown_target');
		assert.strictEqual(record, undefined);
	});

	test('Run record picker returns record for existing target', () => {
		const record = pickRunRecordByTarget({
			sim_default: {
				targetId: 'sim_default',
				timestamp: 123,
				success: true,
				logPath: 'C:/repo/build/tb_top.run.log'
			}
		}, 'sim_default');

		assert.strictEqual(record?.targetId, 'sim_default');
		assert.strictEqual(record?.success, true);
	});

	test('Latest waveform entries helper filters missing files and sorts descending', () => {
		const entries = getLatestWaveformEntries({
			old_target: {
				targetId: 'old_target',
				timestamp: 100,
				success: true,
				waveformPath: 'C:/repo/build/old.fst'
			},
			new_target: {
				targetId: 'new_target',
				timestamp: 200,
				success: true,
				waveformPath: 'C:/repo/build/new.fst'
			},
			missing_target: {
				targetId: 'missing_target',
				timestamp: 300,
				success: true,
				waveformPath: 'C:/repo/build/missing.fst'
			}
		}, filePath => !filePath.includes('missing'));

		assert.strictEqual(entries.length, 2);
		assert.strictEqual(entries[0].targetId, 'new_target');
		assert.strictEqual(entries[1].targetId, 'old_target');
	});

	test('Latest log entries helper filters missing files and sorts descending', () => {
		const entries = getLatestLogEntries({
			old_target: {
				targetId: 'old_target',
				timestamp: 100,
				success: false,
				logPath: 'C:/repo/build/old.log'
			},
			new_target: {
				targetId: 'new_target',
				timestamp: 200,
				success: false,
				logPath: 'C:/repo/build/new.log'
			}
		}, () => true);

		assert.strictEqual(entries.length, 2);
		assert.strictEqual(entries[0].targetId, 'new_target');
		assert.strictEqual(entries[1].targetId, 'old_target');
	});

	test('Target entry prioritizer moves active target to top', () => {
		const entries = prioritizeTargetEntries([
			{ targetId: 'design_default', value: 1 },
			{ targetId: 'sim_default', value: 2 }
		], 'sim_default');

		assert.strictEqual(entries[0].targetId, 'sim_default');
		assert.strictEqual(entries[1].targetId, 'design_default');
	});

	test('Target entry prioritizer keeps order when active target is missing', () => {
		const entries = prioritizeTargetEntries([
			{ targetId: 'design_default', value: 1 },
			{ targetId: 'sim_default', value: 2 }
		], 'unknown_target');

		assert.strictEqual(entries[0].targetId, 'design_default');
		assert.strictEqual(entries[1].targetId, 'sim_default');
	});
});
