import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { ILinterEngine } from '../ILinterEngine';

/**
 * Vivado (xvlog) 引擎适配器
 * 负责调用 xvlog 并解析其输出格式
 * 使用 cp.spawn 流式处理，防止 Buffer 溢出
 */
export class VivadoEngine implements ILinterEngine {
    public readonly name = 'Vivado';

    public check(
        doc: vscode.TextDocument,
        config: vscode.WorkspaceConfiguration,
        outputChannel: vscode.OutputChannel
    ): Promise<vscode.Diagnostic[]> {
        return new Promise((resolve) => {
            let binPath = config.get<string>('linter.executablePath') || 'xvlog';
            const isWindows = process.platform === 'win32';

            if (isWindows) {
                if (!binPath.toLowerCase().endsWith('.bat') && !binPath.toLowerCase().endsWith('.exe')) {
                    if (path.isAbsolute(binPath) || binPath.includes('\\') || binPath.includes('/')) {
                        binPath += '.bat';
                    }
                }
            }

            const args = ['--nolog'];
            if (doc.languageId === 'systemverilog') {
                args.push('-sv');
            }
            args.push(`"${doc.fileName}"`);

            outputChannel.appendLine(`[Vivado] spawn "${binPath}" ${args.join(' ')}`);

            const child = cp.spawn(binPath, args, {
                cwd: path.dirname(doc.fileName),
                shell: true
            });

            let output = '';
            child.stdout.on('data', (data) => { output += data.toString(); });
            child.stderr.on('data', (data) => { output += data.toString(); });

            child.on('error', (error: any) => {
                if (error.code === 'ENOENT' || error.code === 127) {
                    outputChannel.appendLine(`[Vivado] ❌ Not found: ${binPath}`);
                    if (path.isAbsolute(binPath)) {
                        vscode.window.showErrorMessage(`无法找到 Vivado (xvlog)。请检查设置中的路径。`);
                    }
                }
                resolve([]);
            });

            child.on('close', () => {
                if (output.includes('is not recognized')) {
                    outputChannel.appendLine(`[Vivado] ❌ Not recognized: ${binPath}`);
                    if (path.isAbsolute(binPath)) {
                        vscode.window.showErrorMessage(`无法找到 Vivado (xvlog)。请检查设置中的路径。`);
                    }
                    return resolve([]);
                }
                // 过滤无用的 Vivado 环境配置行，保留有意义的日志
                const filteredLines = output.split('\n').filter(
                    l => !l.includes('setupEnv') && !l.includes('loader.bat')
                );
                if (filteredLines.some(l => l.trim())) {
                    outputChannel.appendLine(filteredLines.join('\n'));
                }
                resolve(this.parseDiagnostics(output, doc));
            });
        });
    }

    private parseDiagnostics(output: string, doc: vscode.TextDocument): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const regex = /(ERROR|WARNING):\s+\[(.*?)\]\s+(.*?)\s+\[.*?:(\d+)\]/g;

        let match;
        while ((match = regex.exec(output)) !== null) {
            const severity = match[1] === 'ERROR'
                ? vscode.DiagnosticSeverity.Error
                : vscode.DiagnosticSeverity.Warning;
            const code = match[2];
            const msg = match[3];
            const line = parseInt(match[4]) - 1;

            if (line >= 0) {
                const range = new vscode.Range(line, 0, line, 1000);
                const diagnostic = new vscode.Diagnostic(range, `[${code}] ${msg}`, severity);
                diagnostic.source = 'Vivado';
                diagnostics.push(diagnostic);
            }
        }
        return diagnostics;
    }
}
