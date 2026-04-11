import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { FilelistParser } from '../project/filelistParser';
import { ClassificationService } from '../project/classificationService';
import { ProjectConfigStatus, Role, TargetKind } from '../project/types';
import { HdlTreeProvider } from '../project/hdlTreeProvider';
import { HdlInstance, HdlModule, HdlPort } from '../project/hdlSymbol';
import { mapLegacyTopSelection } from '../project/topSelectionPolicy';
import {
	getDualHierarchyChecklistPath,
	openDualHierarchyRegressionChecklist
} from '../commands/openDualHierarchyRegressionChecklist';
import {
	buildProjectConfigTemplate,
	inferDefaultTops
} from '../commands/createProjectConfig';
import { buildTargetContextDebugSnapshot } from '../commands/debugActiveTargetContext';
import { getProjectConfigPath, openProjectConfig } from '../commands/openProjectConfig';
import { formatRunRecords } from '../commands/debugRecentRuns';
import { pickRunRecordForTarget } from '../commands/openLastWaveformByTarget';
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

	test('Recent runs formatter returns fallback line for empty records', () => {
		const lines = formatRunRecords({});
		assert.deepStrictEqual(lines, ['No run records available.']);
	});

	test('Recent runs formatter includes target and success fields', () => {
		const lines = formatRunRecords({
			sim_default: {
				targetId: 'sim_default',
				timestamp: 1000,
				success: true,
				taskName: 'Simulate tb_top',
				waveformPath: 'C:/repo/build/tb_top.fst',
				buildDir: 'C:/repo/build'
			}
		});

		assert.ok(lines.some(line => line.includes('Target: sim_default')));
		assert.ok(lines.some(line => line.includes('Success: true')));
		assert.ok(lines.some(line => line.includes('Waveform: C:/repo/build/tb_top.fst')));
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
});
