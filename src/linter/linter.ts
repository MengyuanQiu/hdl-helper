import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export default class VerilogLinter implements vscode.Disposable {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private outputChannel: vscode.OutputChannel;
    private timer: NodeJS.Timeout | undefined;

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('verilog-linter');
        this.outputChannel = vscode.window.createOutputChannel('HDL Helper Log');
    }

    public activate(subscriptions: vscode.Disposable[]) {
        subscriptions.push(this);
        vscode.workspace.onDidSaveTextDocument(this.lint, this, subscriptions);
        vscode.workspace.onDidOpenTextDocument(this.lint, this, subscriptions);
        
        vscode.workspace.onDidCloseTextDocument((doc) => {
            this.diagnosticCollection.delete(doc.uri);
        }, null, subscriptions);
    }

    public dispose() {
        this.diagnosticCollection.clear();
        this.diagnosticCollection.dispose();
        this.outputChannel.dispose();
        if (this.timer) {
            clearTimeout(this.timer);
        }
    }

    private lint(doc: vscode.TextDocument) {
        if (doc.languageId !== 'verilog' && doc.languageId !== 'systemverilog') {
            return;
        }
        if (this.timer) {
            clearTimeout(this.timer);
        }
        // 防抖：500ms 内只执行一次
        this.timer = setTimeout(() => {
            this.runLinter(doc);
        }, 500); 
    }

    private runLinter(doc: vscode.TextDocument) {
        const config = vscode.workspace.getConfiguration('hdl-helper');
        const tool = config.get<string>('linter.tool') || 'xvlog';

        if (tool === 'verible-lint') {
            this.lintWithVerible(doc, config);
        } else {
            this.lintWithVivado(doc, config);
        }
    }

    // =========================================================
    // 引擎 A: Vivado (xvlog)
    // =========================================================
    private lintWithVivado(doc: vscode.TextDocument, config: vscode.WorkspaceConfiguration) {
        let binPath = config.get<string>('linter.executablePath') || 'xvlog';
        const isWindows = process.platform === 'win32';
        
        // 1. 路径处理与补全
        if (isWindows) {
            if (!binPath.toLowerCase().endsWith('.bat') && !binPath.toLowerCase().endsWith('.exe')) {
                if (path.isAbsolute(binPath) || binPath.includes('\\') || binPath.includes('/')) {
                    binPath += '.bat';
                }
            }
        }

        // 2. 构造参数
        const args = ['--nolog'];
        if (doc.languageId === 'systemverilog') {
            args.push('-sv');
        }
        // 文件名必须加引号，防止空格
        args.push(`"${doc.fileName}"`);

        // 3. 构造命令 (改为 spawn 流式处理)
        this.outputChannel.appendLine(`[Vivado Spawn] "${binPath}" ${args.join(' ')}`);

        // shell: true 保证能正常调用 .bat
        const child = cp.spawn(binPath, args, { 
            cwd: path.dirname(doc.fileName), 
            shell: true 
        });

        let output = '';
        
        child.stdout.on('data', (data) => {
            output += data.toString();
        });

        child.stderr.on('data', (data) => {
            output += data.toString();
        });

        child.on('error', (error: any) => {
            if (error.code === 'ENOENT' || error.code === 127) {
                this.outputChannel.appendLine(`[Error] Vivado executable not found: ${binPath}`);
                if (path.isAbsolute(binPath)) {
                    vscode.window.showErrorMessage(`无法找到 Vivado (xvlog)。请检查设置中的路径。`);
                }
            } else {
                this.outputChannel.appendLine(`[Error] failed to spawn Vivado: ${error.message}`);
            }
        });

        child.on('close', (code) => {
            if (output.includes('is not recognized')) {
                this.outputChannel.appendLine(`[Error] Vivado executable not found: ${binPath}`);
                if (path.isAbsolute(binPath)) {
                    vscode.window.showErrorMessage(`无法找到 Vivado (xvlog)。请检查设置中的路径。`);
                }
                return;
            }

            if (output.trim().length > 0) {
                const lines = output.split('\n').filter(l => !l.includes('setupEnv') && !l.includes('loader.bat'));
                if (lines.length > 0) {
                    this.outputChannel.appendLine(lines.join('\n'));
                }
            }

            const diagnostics = this.parseVivadoOutput(output, doc);
            this.diagnosticCollection.set(doc.uri, diagnostics);
        });
    }

    private parseVivadoOutput(output: string, doc: vscode.TextDocument): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const regex = /(ERROR|WARNING):\s+\[(.*?)\]\s+(.*?)\s+\[.*?:(\d+)\]/g;
        
        let match;
        while ((match = regex.exec(output)) !== null) {
            const severity = match[1] === 'ERROR' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
            const code = match[2];
            const msg = match[3];
            const line = parseInt(match[4]) - 1;
            
            if (line >= 0) {
                const range = new vscode.Range(line, 0, line, 1000);
                const diagnostic = new vscode.Diagnostic(range, `${code}: ${msg}`, severity);
                diagnostic.source = 'Vivado';
                diagnostics.push(diagnostic);
            }
        }
        return diagnostics;
    }

    // =========================================================
    // 引擎 B: Verible Lint (Google) - 最终修复版
    // =========================================================
    private lintWithVerible(doc: vscode.TextDocument, config: vscode.WorkspaceConfiguration) {
        let binPath = config.get<string>('linter.veriblePath') || 'verible-verilog-lint';
        
        if (process.platform === 'win32' && !binPath.toLowerCase().endsWith('.exe')) {
            if (binPath.includes('\\') || binPath.includes('/')) {
                binPath += '.exe';
            }
        }

        // 1. 获取规则配置
        const rulesConfig = config.get<{[key: string]: boolean | string}>('linter.rules') || {};

        // 2. 自动同步 Formatter 的行宽
        if (rulesConfig['line-length'] === undefined) {
             const formatFlags = config.get<string[]>('formatter.flags') || [];
             const limitFlag = formatFlags.find(f => f.includes('--column_limit'));
             
             if (limitFlag) {
                 const match = limitFlag.match(/[= ](\d+)/);
                 if (match) {
                     rulesConfig['line-length'] = `length:${match[1]}`;
                 }
             } else {
                 rulesConfig['line-length'] = `length:150`; // 默认保底
             }
        }

        // 3. 构建 rules 字符串列表
        const ruleList: string[] = [];

        for (const [ruleName, value] of Object.entries(rulesConfig)) {
            if (value === false) {
                // 布尔 false -> 禁用规则
                ruleList.push(`-${ruleName}`);
            } else if (value === true) {
                // 布尔 true -> 启用规则 (无配置)
                ruleList.push(ruleName);
            } else if (typeof value === 'string') {
                // [关键修复] 处理字符串类型的 "true"/"false"
                // 很多用户会在 json 里误写成字符串，这里做个兼容
                if (value === 'true') {
                    ruleList.push(ruleName); // 等同于启用
                } else if (value === 'false') {
                    ruleList.push(`-${ruleName}`); // 等同于禁用
                } else {
                    // 真正的配置字符串，比如 "length:150"
                    ruleList.push(`${ruleName}=${value}`);
                }
            }
        }

        // 4. 构造参数数组
        // [关键优化] 将 flag 和 value 拆开。
        // 这是 execFile 最安全的方式，Node.js 会自动处理它们之间的关联，
        // 彻底杜绝了 "parameter-name-style=true" 这种因为解析歧义导致的整段丢弃问题。
        const args = [
            '--lint_fatal=false', 
            '--parse_fatal=false',
            '--rules',           // 参数名
            ruleList.join(','),  // 参数值
            doc.fileName
        ];
        
        // 打印调试日志
        this.outputChannel.appendLine(`[Verible Exec] "${binPath}" ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`);

        cp.execFile(binPath, args, { cwd: path.dirname(doc.fileName) }, (error, stdout, stderr) => {
            const output = stderr.toString() + stdout.toString();
            
            if (error) {
                 if ((error as any).code === 'ENOENT') {
                    this.outputChannel.appendLine(`[Error] Verible not found: ${binPath}`);
                    return;
                }
            }

            const diagnostics = this.parseVeribleOutput(output, doc);
            this.diagnosticCollection.set(doc.uri, diagnostics);
        });
    }

    private parseVeribleOutput(output: string, doc: vscode.TextDocument): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const regex = /^(.*):(\d+):(\d+)(?:-\d+)?:\s+(.*)$/gm;

        let match;
        while ((match = regex.exec(output)) !== null) {
            const filePath = match[1];
            const line = parseInt(match[2]) - 1;
            const col = parseInt(match[3]) - 1;
            const msg = match[4];

            // 过滤非当前文件的报错
            if (path.basename(filePath) !== path.basename(doc.fileName)) {
                continue; 
            }

            let severity = vscode.DiagnosticSeverity.Warning;
            if (msg.toLowerCase().includes('error') || msg.toLowerCase().includes('fatal')) {
                severity = vscode.DiagnosticSeverity.Error;
            }
            
            if (line >= 0) {
                const range = new vscode.Range(line, col, line, 1000);
                const diagnostic = new vscode.Diagnostic(range, msg, severity);
                diagnostic.source = 'Verible';
                diagnostics.push(diagnostic);
            }
        }
        return diagnostics;
    }
}