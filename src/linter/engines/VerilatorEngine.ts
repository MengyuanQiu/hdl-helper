import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { ILinterEngine } from '../ILinterEngine';
import { ProjectManager } from '../../project/projectManager';

/**
 * Verilator 引擎适配器 (加固版)
 *
 * 完整特性：
 *   ① Phase 3+4: 内置黑盒参数 (--bbox-sys, --bbox-unsup) + --timing + 自定义 flags
 *   ② Phase 2:   自动从 ProjectManager 提取工程目录，注入 -y <dir> 搜索路径
 *   ③ Phase 1:   Windows/MSYS2 DLL 环境注入，自动将 verilator_bin.exe 的父目录追加到 PATH
 *
 * 输出格式 (Verilator 标准结构化):
 *   %Warning-WIDTH: /path/file.sv:45:10: Operator ASSIGN expects 8 bits...
 *   %Error: /path/file.sv:50:1: syntax error...
 */
export class VerilatorEngine implements ILinterEngine {
    public readonly name = 'Verilator';

    constructor(private projectManager?: ProjectManager) {}

    public check(
        doc: vscode.TextDocument,
        config: vscode.WorkspaceConfiguration,
        outputChannel: vscode.OutputChannel
    ): Promise<vscode.Diagnostic[]> {
        return new Promise((resolve) => {

            // ================================================================
            // Phase 1-A: 路径解析 + Windows MSYS2 适配
            //   MSYS2 实际可执行文件是 verilator_bin.exe，不是 verilator (Perl 包装脚本)
            // ================================================================
            let binPath = config.get<string>('linter.verilatorPath') || 'verilator';
            const isWindows = process.platform === 'win32';

            if (isWindows) {
                const lower = binPath.toLowerCase();
                if (!lower.endsWith('verilator_bin') && !lower.endsWith('verilator_bin.exe')) {
                    if (lower.endsWith('verilator') || lower.endsWith('verilator.exe')) {
                        binPath = binPath.replace(/verilator(\.exe)?$/i, 'verilator_bin');
                    }
                }
                if (!binPath.toLowerCase().endsWith('.exe')) {
                    if (path.isAbsolute(binPath) || binPath.includes('\\')) {
                        binPath += '.exe';
                    }
                }
            }

            // ================================================================
            // Phase 1-B: DLL 环境注入
            //   将 verilator_bin.exe 所在目录强制追加到子进程的 PATH
            //   防止因 MSYS2 未加入系统 PATH 而导致 libstdc++-6.dll 找不到
            // ================================================================
            const spawnEnv = { ...process.env };
            if (isWindows && path.isAbsolute(binPath)) {
                const binDir = path.dirname(binPath);
                const currentPath = spawnEnv['PATH'] || spawnEnv['Path'] || '';
                if (!currentPath.includes(binDir)) {
                    spawnEnv['PATH'] = `${binDir};${currentPath}`;
                    outputChannel.appendLine(`[Verilator] 🔧 DLL path injected: ${binDir}`);
                }
            }

            // ================================================================
            // Phase 3: 构造基础参数
            //   --lint-only   : 只做静态分析，不生成仿真文件
            //   -Wall         : 开启所有警告
            //   --sv          : 启用 SystemVerilog 语法支持（对 .v 文件无副作用）
            //   --timing      : 支持延时语法 (#10 ns 等)，Verilator 5.x 必须
            //   --bbox-sys    : 遇到不支持的系统函数直接视为黑盒，不中断检查
            //   --bbox-unsup  : 遇到找不到的模块声明视为黑盒，兼容 Xilinx/Intel 原语
            // ================================================================
            const args: string[] = [
                '--lint-only',
                '-Wall',
                '--sv',
                '--timing',
                '--bbox-sys',
                '--bbox-unsup',
            ];

            // ================================================================
            // Phase 2: 工程 Include 路径注入
            //   从 ProjectManager 获取工程中所有 .v/.sv 文件的目录
            //   注入 -y <dir>（模块搜索路径）消除 "Module not found" 误报
            // ================================================================
            if (this.projectManager) {
                const includeDirs = this.projectManager.getIncludeDirs();
                for (const dir of includeDirs) {
                    // -y 用于模块搜索（例化查找），-I 用于 `include 文件查找
                    args.push('-y', dir);
                    args.push(`-I${dir}`);
                }
                if (includeDirs.length > 0) {
                    outputChannel.appendLine(`[Verilator] 📁 Injected ${includeDirs.length} include dir(s)`);
                }
            }

            // ================================================================
            // Phase 3 续: 用户自定义 flags（优先级最高，可覆盖上面的默认行为）
            //   例如: ["-Wno-WIDTH", "-Wno-UNUSED", "--bbox-sys"]
            // ================================================================
            const customFlags = config.get<string[]>('linter.verilatorFlags') || [];
            if (customFlags.length > 0) {
                args.push(...customFlags);
            }

            // 文件路径最后放
            args.push(doc.fileName);

            outputChannel.appendLine(`[Verilator] "${binPath}" ${args.join(' ')}`);

            const child = cp.spawn(binPath, args, {
                cwd: path.dirname(doc.fileName),
                shell: false,
                env: spawnEnv,   // Phase 1-B: 注入了 DLL 目录的环境变量
            });

            let output = '';
            child.stdout.on('data', (data) => { output += data.toString(); });
            child.stderr.on('data', (data) => { output += data.toString(); });

            child.on('error', (error: any) => {
                if (error.code === 'ENOENT') {
                    outputChannel.appendLine(`[Verilator] ❌ Not found: "${binPath}"\n  请安装 Verilator 并在设置中配置 hdl-helper.linter.verilatorPath`);
                } else {
                    outputChannel.appendLine(`[Verilator] ❌ Spawn error: ${error.message}`);
                }
                resolve([]);
            });

            child.on('close', () => {
                if (output.trim()) {
                    outputChannel.appendLine(`[Verilator Output]\n${output.trim()}`);
                }
                resolve(this.parseDiagnostics(output, doc));
            });
        });
    }

    /**
     * 解析 Verilator 输出，提取诊断信息
     *
     * 支持以下格式:
     *   %Warning-<CODE>: <file>:<line>:<col>: <message>
     *   %Error[-<CODE>]: <file>:<line>:<col>: <message>
     */
    private parseDiagnostics(output: string, doc: vscode.TextDocument): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];

        // Group 1: Warning | Error
        // Group 2: 错误码 (可选，如 WIDTH, UNUSED, UNDRIVEN)
        // Group 3: 文件路径
        // Group 4: 行号
        // Group 5: 列号
        // Group 6: 错误信息
        const regex = /^%(Warning|Error)(?:-(\w+))?:\s+(.*?):(\d+):(\d+):\s+(.*)$/gm;

        let match;
        while ((match = regex.exec(output)) !== null) {
            const levelStr = match[1];
            const code     = match[2];
            const filePath = match[3];
            const line     = parseInt(match[4]) - 1;
            const col      = parseInt(match[5]) - 1;
            const msg      = match[6];

            // 只保留当前被检查文件的诊断（过滤掉 include 进来的其他文件报告）
            // 路径比较使用 normalize 防止大小写和斜杠差异
            const normFile = path.normalize(filePath);
            const normDoc  = path.normalize(doc.fileName);
            if (normFile !== normDoc && path.basename(filePath) !== path.basename(doc.fileName)) {
                continue;
            }

            const severity = levelStr === 'Error'
                ? vscode.DiagnosticSeverity.Error
                : vscode.DiagnosticSeverity.Warning;

            const displayMsg = code ? `[${code}] ${msg}` : msg;

            if (line >= 0) {
                const range = new vscode.Range(line, Math.max(0, col), line, 1000);
                const diagnostic = new vscode.Diagnostic(range, displayMsg, severity);
                diagnostic.source = 'Verilator';
                if (code) {
                    diagnostic.code = code;
                }
                diagnostics.push(diagnostic);
            }
        }

        return diagnostics;
    }
}
