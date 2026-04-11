import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// 创建专用输出通道 (Lazy Load 模式：只有出错时用户才会去查看)
const formatOutputChannel = vscode.window.createOutputChannel('HDL Formatter');

export async function runVeribleFormat(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken
): Promise<vscode.TextEdit[]> {

    return new Promise((resolve) => {
        const config = vscode.workspace.getConfiguration('hdl-helper');
        let binPath = config.get<string>('formatter.executablePath') || 'verible-verilog-format';

        // 1. Windows 路径修正
        if (process.platform === 'win32') {
            if (!binPath.toLowerCase().endsWith('.exe')) {
                if (binPath.includes('/') || binPath.includes('\\') || path.isAbsolute(binPath)) {
                    binPath += '.exe';
                }
            }
        }

        // 2. 基础检查
        // 仅在“显式路径”模式下做文件存在检查；如果只是命令名则交给系统 PATH 查找。
        const looksLikeExplicitPath = path.isAbsolute(binPath) || binPath.includes('/') || binPath.includes('\\');
        if (looksLikeExplicitPath && !fs.existsSync(binPath)) {
            vscode.window.showErrorMessage(`HDL Helper: 找不到格式化工具 ${binPath}`);
            return resolve([]);
        }

        // 3. 参数构建
        const customFlags = config.get<string[]>('formatter.flags') || [];
        
        const args = [
            `--indentation_spaces=${options.tabSize}`,
            '--failsafe_success=false',  // 遇到语法错误时退出，不强行格式化，防止改坏代码
        ];

        // 智能参数：如果用户未自定义对齐方式，则应用推荐的默认对齐
        if (!customFlags.some(f => f.includes('alignment'))) {
            args.push(
                '--assignment_statement_alignment=preserve',
                '--case_items_alignment=preserve', 
                '--class_member_variable_alignment=preserve'
            );
        }

        // 追加用户自定义参数 (优先级最高)
        args.push(...customFlags);
        
        // 必须在最后添加 '-' 表示从 Stdin 读取
        args.push('-');

        const cwd = path.dirname(document.fileName);

        // 4. 启动进程
        let child: cp.ChildProcess;
        try {
            child = cp.spawn(binPath, args, { cwd: cwd, shell: false, stdio: 'pipe' });
        } catch (e) {
            vscode.window.showErrorMessage(`启动格式化进程失败: ${e}`);
            return resolve([]);
        }

        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];

        child.stdout!.on('data', chunk => stdoutChunks.push(chunk));
        child.stderr!.on('data', chunk => stderrChunks.push(chunk));

        child.on('close', (code) => {
            if (token.isCancellationRequested) {return resolve([]);}

            const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
            const stderr = Buffer.concat(stderrChunks).toString('utf-8');

            // --- 错误处理 ---
            if (code !== 0) {
                // 记录详细日志到 Output 面板 (供排查)
                formatOutputChannel.appendLine(`[Time] ${new Date().toLocaleTimeString()}`);
                formatOutputChannel.appendLine(`[Error] Exit Code: ${code}`);
                formatOutputChannel.appendLine(`[Command] ${binPath} ${args.join(' ')}`);
                if (stderr) {formatOutputChannel.appendLine(`[Stderr] ${stderr}`);}

                // UI 提示：仅针对语法错误进行温和提示
                if (stderr.includes('syntax error')) {
                    vscode.window.setStatusBarMessage('$(error) Verible: 代码存在语法错误，无法格式化', 4000);
                } else {
                    // 其他错误（如参数错误）
                    vscode.window.setStatusBarMessage('$(warning) Verible: 格式化失败，请查看 Output', 4000);
                }
                return resolve([]);
            }

            if (!stdout) {return resolve([]);}

            // --- 成功 ---
            // 可以在状态栏给一个微小的反馈，提升体验
            vscode.window.setStatusBarMessage('$(check) 格式化完成', 2000);
            
            const lastLineId = document.lineCount - 1;
            const range = new vscode.Range(0, 0, lastLineId, document.lineAt(lastLineId).text.length);
            resolve([vscode.TextEdit.replace(range, stdout)]);
        });

        // 5. 写入代码到 Stdin
        try {
            const text = document.getText();
            // 关键：统一换行符为 LF，解决 Windows 下 CRLF 导致的跨平台兼容性问题
            const normalizedText = text.replace(/\r\n/g, '\n'); 
            child.stdin!.write(normalizedText, 'utf-8');
            child.stdin!.end(); 
        } catch (e) {
            console.error(`[Stdin Error] ${e}`);
            resolve([]);
        }
    });
}

// 导出 Provider
export default class VerilogFormatter implements vscode.DocumentFormattingEditProvider {
    public provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): Promise<vscode.TextEdit[]> {
        return runVeribleFormat(document, options, token);
    }
}