import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { ProjectManager } from '../project/projectManager';

export interface HdlSimTask {
    name: string;
    type: 'hdl-sim';
    tool: 'iverilog' | 'verilator' | 'xsim' | 'modelsim';
    top: string;
    sources: string[];
    flags?: string[];
    waveform?: boolean;
    waveformFormat?: 'vcd' | 'fst';
}

export class SimManager {
    private static outputChannel = vscode.window.createOutputChannel('HDL Simulation');

    /**
     * 读取工作区下的 .vscode/hdl_tasks.json 配置
     */
    public static async getTasks(workspaceUri: vscode.Uri): Promise<HdlSimTask[]> {
        const tasksPath = path.join(workspaceUri.fsPath, '.vscode', 'hdl_tasks.json');
        
        if (!fs.existsSync(tasksPath)) {
            // 如果不存在，返回个空的或者考虑提示用户创建
            return [];
        }

        try {
            const content = await fs.promises.readFile(tasksPath, 'utf8');
            // 简单的 JSON 解析，这里为了鲁棒可以考虑使用 jsonc-parser，但先用标准 JSON
            const data = JSON.parse(content);
            if (data && Array.isArray(data.tasks)) {
                return data.tasks as HdlSimTask[];
            }
        } catch (e) {
            SimManager.outputChannel.appendLine(`[Error] Failed to parse hdl_tasks.json: ${e}`);
        }
        
        return [];
    }

    /**
     * 自动为一个 Testbench 模块生成或获取默认仿真任务
     */
    public static async getDefaultTaskForModule(
        moduleName: string, 
        projectManager: ProjectManager
    ): Promise<HdlSimTask> {
        // 先看看有没有正好名为 `Simulate ${moduleName}` 或者 top == moduleName 的 task
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const wsUri = vscode.workspace.workspaceFolders[0].uri;
            const tasks = await this.getTasks(wsUri);
            const existing = tasks.find(t => t.top === moduleName);
            if (existing) {
                return existing;
            }
        }

        // 如果没有，组装一个默认的 Icarus Verilog 任务
        // -g2012 支持 SystemVerilog
        return {
            name: `Simulate ${moduleName}`,
            type: 'hdl-sim',
            tool: 'iverilog',
            top: moduleName,
            sources: [], // 由启动时动态收集
            flags: ['-g2012'],
            waveform: true,
            waveformFormat: 'fst'
        };
    }

    /**
     * 运行仿真任务
     */
    public static async runTask(task: HdlSimTask, projectManager: ProjectManager) {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder open for simulation.');
            return;
        }

        const wsPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        
        // 如果 sources 为空，我们自动把工程里的所有 HDL 目录和顶层文件加进去
        let includeFlags: string[] = [];
        let srcFiles: string[] = [];
        
        if (!task.sources || task.sources.length === 0) {
            // 自动收集：利用 ProjectManager 的 includeDirs
            const dirs = projectManager.getIncludeDirs();
            includeFlags = dirs.map(d => `-y "${d}" -I "${d}"`);
            
            const topDef = projectManager.getModule(task.top);
            if (topDef) {
                srcFiles.push(`"${topDef.fileUri.fsPath}"`);
            } else {
                vscode.window.showErrorMessage(`Simulation skipped: Cannot find top module '${task.top}'.`);
                return;
            }
        } else {
            // 如果用户写明了 sources，可以直接展开 glob，这里先简单当文件名处理
            srcFiles = task.sources.map(s => `"${s}"`);
        }

        const buildDir = path.join(wsPath, 'build');
        if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir);

        if (task.tool === 'iverilog') {
            await this.runIverilog(task, wsPath, buildDir, srcFiles, includeFlags);
        } else {
            vscode.window.showWarningMessage(`Simulator tool '${task.tool}' is not yet supported in this preview.`);
        }
    }

    private static async runIverilog(
        task: HdlSimTask, 
        wsPath: string, 
        buildDir: string, 
        srcFiles: string[], 
        includeFlags: string[]
    ) {
        this.outputChannel.show();
        this.outputChannel.clear();
        this.outputChannel.appendLine(`[Sim] Starting Icarus Verilog simulation for ${task.top}...`);

        const vvpFile = path.join(buildDir, `${task.top}.vvp`);
        
        let cmd = `iverilog ${task.flags?.join(' ') || '-g2012'} ${includeFlags.join(' ')} -o "${vvpFile}" ${srcFiles.join(' ')}`;
        
        if (task.waveform && task.waveformFormat === 'fst') {
            // 如果开启 fst，这里其实靠 tb 内部的 $dumpfile, 但我们可以追加一个全局 define
            cmd += ` -DFST_DUMP`; 
        }

        this.outputChannel.appendLine(`[Sim] Compiling: ${cmd}`);

        try {
            await this.execPromise(cmd, wsPath);
            this.outputChannel.appendLine(`[Sim] Compilation successful.`);
            
            // 运行 VVP
            let runCmd = `vvp "${vvpFile}"`;
            if (task.waveform && task.waveformFormat === 'fst') {
                runCmd += ` -fst`;
            }

            this.outputChannel.appendLine(`[Sim] Running: ${runCmd}`);
            const output = await this.execPromise(runCmd, wsPath);
            this.outputChannel.appendLine(output);
            this.outputChannel.appendLine(`[Sim] Simulation finished.`);

            // 如果配置了波形自动打开
            if (task.waveform) {
                vscode.window.showInformationMessage(`Simulation complete. Waveform ready.`);
            }

        } catch (err: any) {
            this.outputChannel.appendLine(`[Error] Simulation failed:\n${err.message}`);
        }
    }

    private static execPromise(command: string, cwd: string): Promise<string> {
        return new Promise((resolve, reject) => {
            cp.exec(command, { cwd }, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(stdout + '\n' + stderr));
                } else {
                    resolve(stdout);
                }
            });
        });
    }
}
