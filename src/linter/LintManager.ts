import * as vscode from 'vscode';
import { ILinterEngine } from './ILinterEngine';
import { VeribleEngine } from './engines/VeribleEngine';
import { VivadoEngine } from './engines/VivadoEngine';
import { VerilatorEngine } from './engines/VerilatorEngine';
import { ProjectManager } from '../project/projectManager';

/**
 * LintManager - 多引擎 Linter 中枢调度器
 * 
 * 职责:
 *   1. 监听文件保存/打开事件（带防抖）
 *   2. 根据用户 activeEngines 配置，用 Promise.all() 并发调用多个引擎
 *   3. 聚合所有引擎的诊断结果，合并推送到 VS Code Problems 面板
 *   4. 在状态栏显示 Linting 动画和完成提示
 */
export class LintManager implements vscode.Disposable {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private outputChannel: vscode.OutputChannel;
    private timer: NodeJS.Timeout | undefined;

    // 引擎注册表 (在构造函数中初始化，以便传入 projectManager)
    private readonly engineRegistry: Map<string, ILinterEngine>;

    // 防抖时间 (多引擎并发，适当延长到 800ms)
    private readonly DEBOUNCE_MS = 800;

    constructor(private projectManager?: ProjectManager) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('hdl-linter');
        this.outputChannel = vscode.window.createOutputChannel('HDL Helper Log');
        // 在此处创建引擎实例，确保 projectManager 已赋值
        this.engineRegistry = new Map<string, ILinterEngine>([
            ['verible',   new VeribleEngine()],
            ['vivado',    new VivadoEngine()],
            ['verilator', new VerilatorEngine(this.projectManager)],
        ]);
    }

    public activate(subscriptions: vscode.Disposable[]): void {
        subscriptions.push(this);
        vscode.workspace.onDidSaveTextDocument(this.onDocumentEvent, this, subscriptions);
        vscode.workspace.onDidOpenTextDocument(this.onDocumentEvent, this, subscriptions);
        vscode.workspace.onDidCloseTextDocument((doc) => {
            this.diagnosticCollection.delete(doc.uri);
        }, null, subscriptions);
    }

    public dispose(): void {
        this.diagnosticCollection.clear();
        this.diagnosticCollection.dispose();
        this.outputChannel.dispose();
        if (this.timer) {
            clearTimeout(this.timer);
        }
    }

    private onDocumentEvent(doc: vscode.TextDocument): void {
        if (doc.languageId !== 'verilog' && doc.languageId !== 'systemverilog') {
            return;
        }
        // 防抖：重置计时器
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => {
            this.runAll(doc);
        }, this.DEBOUNCE_MS);
    }

    /**
     * 核心调度方法：并发执行所有激活的引擎
     */
    private async runAll(doc: vscode.TextDocument): Promise<void> {
        const config = vscode.workspace.getConfiguration('hdl-helper');

        // 读取激活的引擎列表（默认只用 verible）
        const activeEngineNames = config.get<string[]>('linter.activeEngines') ?? ['verible'];

        // 过滤出已注册且被激活的引擎
        const activeEngines: ILinterEngine[] = [];
        for (const name of activeEngineNames) {
            const engine = this.engineRegistry.get(name.toLowerCase());
            if (engine) {
                activeEngines.push(engine);
            } else {
                this.outputChannel.appendLine(`[LintManager] ⚠️ Unknown engine: "${name}". Skipping.`);
            }
        }

        if (activeEngines.length === 0) {
            this.diagnosticCollection.set(doc.uri, []);
            return;
        }

        // 状态栏动画
        const engineLabel = activeEngines.map(e => e.name).join(', ');
        const statusBarItem = vscode.window.setStatusBarMessage(
            `$(sync~spin) HDL Lint running (${engineLabel})...`
        );

        this.outputChannel.appendLine(
            `\n[LintManager] ===== Linting: ${doc.fileName} | Engines: ${engineLabel} =====`
        );

        try {
            // 并发执行所有引擎
            const results = await Promise.all(
                activeEngines.map(engine =>
                    engine.check(doc, config, this.outputChannel).catch(err => {
                        this.outputChannel.appendLine(`[${engine.name}] ❌ Crashed: ${err}`);
                        return [] as vscode.Diagnostic[];
                    })
                )
            );

            // 聚合所有诊断结果
            const allDiagnostics = results.flat();
            this.diagnosticCollection.set(doc.uri, allDiagnostics);

            const errorCount   = allDiagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
            const warningCount = allDiagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Warning).length;

            this.outputChannel.appendLine(
                `[LintManager] ✅ Done. ${errorCount} error(s), ${warningCount} warning(s).`
            );

            // 状态栏结果提示（2.5 秒后消失）
            statusBarItem.dispose();
            if (errorCount > 0) {
                vscode.window.setStatusBarMessage(`$(error) HDL: ${errorCount} error(s), ${warningCount} warning(s)`, 2500);
            } else if (warningCount > 0) {
                vscode.window.setStatusBarMessage(`$(warning) HDL: ${warningCount} warning(s)`, 2500);
            } else {
                vscode.window.setStatusBarMessage(`$(check) HDL: No issues found`, 2500);
            }
        } catch (err) {
            statusBarItem.dispose();
            this.outputChannel.appendLine(`[LintManager] ❌ Fatal error: ${err}`);
        }
    }
}
