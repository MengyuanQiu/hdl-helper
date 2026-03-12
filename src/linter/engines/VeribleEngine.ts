import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { ILinterEngine } from '../ILinterEngine';

/**
 * Verible Lint 引擎适配器
 * 负责调用 verible-verilog-lint 并解析其输出格式
 */
export class VeribleEngine implements ILinterEngine {
    public readonly name = 'Verible';

    public check(
        doc: vscode.TextDocument,
        config: vscode.WorkspaceConfiguration,
        outputChannel: vscode.OutputChannel
    ): Promise<vscode.Diagnostic[]> {
        return new Promise((resolve) => {
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
                    rulesConfig['line-length'] = 'length:150';
                }
            }

            // 3. 构建 rules 字符串
            const ruleList: string[] = [];
            for (const [ruleName, value] of Object.entries(rulesConfig)) {
                if (value === false || value === 'false') {
                    ruleList.push(`-${ruleName}`);
                } else if (value === true || value === 'true') {
                    ruleList.push(ruleName);
                } else if (typeof value === 'string') {
                    ruleList.push(`${ruleName}=${value}`);
                }
            }

            const args = [
                '--lint_fatal=false',
                '--parse_fatal=false',
                '--rules',
                ruleList.join(','),
                doc.fileName
            ];

            outputChannel.appendLine(`[Verible] "${binPath}" ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`);

            cp.execFile(binPath, args, { cwd: path.dirname(doc.fileName) }, (error, stdout, stderr) => {
                if (error && (error as any).code === 'ENOENT') {
                    outputChannel.appendLine(`[Verible] ❌ Not found: ${binPath}`);
                    return resolve([]);
                }
                const output = stderr.toString() + stdout.toString();
                resolve(this.parseDiagnostics(output, doc));
            });
        });
    }

    private parseDiagnostics(output: string, doc: vscode.TextDocument): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const regex = /^(.*):(\\d+):(\\d+)(?:-\\d+)?:\\s+(.*)$/gm;

        let match;
        while ((match = regex.exec(output)) !== null) {
            const filePath = match[1];
            const line = parseInt(match[2]) - 1;
            const col = parseInt(match[3]) - 1;
            const msg = match[4];

            if (path.basename(filePath) !== path.basename(doc.fileName)) continue;

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
