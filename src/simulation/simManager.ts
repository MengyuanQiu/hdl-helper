import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as iconv from 'iconv-lite';
import { ProjectManager } from '../project/projectManager';
import { FilelistParser } from '../project/filelistParser';

export interface HdlSimTask {
    name: string;
    type: 'hdl-sim';
    tool: 'iverilog' | 'verilator' | 'xsim' | 'modelsim';
    top: string;
    sources?: string[];
    filelist?: string | string[];
    flags?: string[];
    waveform?: boolean;
    waveformFormat?: 'vcd' | 'fst';
    buildDir?: string;
    workingDirectory?: string;
    iverilogPath?: string;
    vvpPath?: string;
    autoOpenWaveform?: boolean;
}

interface SimRuntimeConfig {
    tasksFile: string;
    iverilogPath: string;
    vvpPath: string;
    buildDir: string;
    defaultFlags: string[];
    autoOpenWaveform: boolean;
}

export class SimManager {
    private static outputChannel = vscode.window.createOutputChannel('HDL Simulation');

    private static getSimulationConfig(workspaceUri: vscode.Uri): SimRuntimeConfig {
        const config = vscode.workspace.getConfiguration('hdl-helper', workspaceUri);
        return {
            tasksFile: config.get<string>('simulation.tasksFile') || '.vscode/hdl_tasks.json',
            iverilogPath: config.get<string>('simulation.iverilogPath') || 'iverilog',
            vvpPath: config.get<string>('simulation.vvpPath') || 'vvp',
            buildDir: config.get<string>('simulation.buildDir') || 'build',
            defaultFlags: config.get<string[]>('simulation.defaultFlags') || ['-g2012'],
            autoOpenWaveform: config.get<boolean>('simulation.autoOpenWaveform') ?? true
        };
    }

    private static quotePath(input: string): string {
        return `"${input.replace(/"/g, '\\"')}"`;
    }

    private static resolveWorkspacePath(baseWorkspacePath: string, maybeRelative: string): string {
        if (!maybeRelative) {
            return baseWorkspacePath;
        }
        return path.isAbsolute(maybeRelative)
            ? maybeRelative
            : path.join(baseWorkspacePath, maybeRelative);
    }

    private static async isExecutableAvailable(commandOrPath: string, cwd: string): Promise<boolean> {
        const hasSlash = commandOrPath.includes('/') || commandOrPath.includes('\\');
        if (path.isAbsolute(commandOrPath) || hasSlash) {
            if (fs.existsSync(commandOrPath)) {
                return true;
            }
            if (process.platform === 'win32' && !commandOrPath.toLowerCase().endsWith('.exe')) {
                return fs.existsSync(`${commandOrPath}.exe`);
            }
            return false;
        }

        const probeCmd = process.platform === 'win32'
            ? `where ${commandOrPath}`
            : `command -v ${commandOrPath}`;

        try {
            await this.execPromise(probeCmd, cwd);
            return true;
        } catch {
            return false;
        }
    }

    private static async ensureToolAvailable(
        commandOrPath: string,
        cwd: string,
        settingKey: string,
        displayName: string
    ): Promise<boolean> {
        const ok = await this.isExecutableAvailable(commandOrPath, cwd);
        if (ok) {
            return true;
        }

        this.outputChannel.appendLine(`[Error] ${displayName} not found: ${commandOrPath}`);
        const action = await vscode.window.showErrorMessage(
            `${displayName} not found: ${commandOrPath}. Please install it or configure hdl-helper.${settingKey}.`,
            'Open Simulation Settings'
        );
        if (action === 'Open Simulation Settings') {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'hdl-helper.simulation');
        }
        return false;
    }

    private static resolveWorkspaceUri(
        projectManager: ProjectManager,
        moduleName?: string,
        preferredUri?: vscode.Uri
    ): vscode.Uri | undefined {
        if (preferredUri) {
            const fromPreferred = vscode.workspace.getWorkspaceFolder(preferredUri);
            if (fromPreferred) {
                return fromPreferred.uri;
            }
        }

        if (moduleName) {
            const moduleDef = projectManager.getModuleInWorkspace(moduleName, preferredUri);
            if (moduleDef) {
                const fromModule = vscode.workspace.getWorkspaceFolder(moduleDef.fileUri);
                if (fromModule) {
                    return fromModule.uri;
                }
            }
        }

        const activeUri = vscode.window.activeTextEditor?.document.uri;
        if (activeUri) {
            const fromActive = vscode.workspace.getWorkspaceFolder(activeUri);
            if (fromActive) {
                return fromActive.uri;
            }
        }

        return vscode.workspace.workspaceFolders?.[0]?.uri;
    }

    /**
     * 读取工作区下的 .vscode/hdl_tasks.json 配置
     */
    public static async getTasks(workspaceUri: vscode.Uri): Promise<HdlSimTask[]> {
        const simConfig = this.getSimulationConfig(workspaceUri);
        const tasksPath = this.resolveWorkspacePath(workspaceUri.fsPath, simConfig.tasksFile);
        
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

    public static async getTasksForTop(
        moduleName: string,
        projectManager: ProjectManager,
        workspaceUri?: vscode.Uri
    ): Promise<HdlSimTask[]> {
        const wsUri = this.resolveWorkspaceUri(projectManager, moduleName, workspaceUri);
        if (!wsUri) {
            return [];
        }

        const tasks = await this.getTasks(wsUri);
        return tasks.filter(t => t.top === moduleName);
    }

    /**
     * 自动为一个 Testbench 模块生成或获取默认仿真任务
     */
    public static async getDefaultTaskForModule(
        moduleName: string, 
        projectManager: ProjectManager,
        workspaceUri?: vscode.Uri
    ): Promise<HdlSimTask> {
        // 先看看有没有正好名为 `Simulate ${moduleName}` 或者 top == moduleName 的 task
        const wsUri = this.resolveWorkspaceUri(projectManager, moduleName, workspaceUri);
        if (wsUri) {
            const tasks = await this.getTasks(wsUri);
            const existing = tasks.find(t => t.top === moduleName);
            if (existing) {
                return existing;
            }
        }

        const simConfig = wsUri
            ? this.getSimulationConfig(wsUri)
            : {
                defaultFlags: ['-g2012']
            };

        // 如果没有，组装一个默认的 Icarus Verilog 任务
        // -g2012 支持 SystemVerilog
        return {
            name: `Simulate ${moduleName}`,
            type: 'hdl-sim',
            tool: 'iverilog',
            top: moduleName,
            sources: [], // 由启动时动态收集
            flags: simConfig.defaultFlags,
            waveform: true,
            waveformFormat: 'fst'
        };
    }

    /**
     * 运行仿真任务
     */
    public static async runTask(task: HdlSimTask, projectManager: ProjectManager, workspaceUri?: vscode.Uri) {
        const resolvedWorkspaceUri = this.resolveWorkspaceUri(projectManager, task.top, workspaceUri);
        if (!resolvedWorkspaceUri) {
            vscode.window.showErrorMessage('No workspace folder open for simulation.');
            return;
        }

        const wsPath = resolvedWorkspaceUri.fsPath;
        const simConfig = this.getSimulationConfig(resolvedWorkspaceUri);
        const workingDir = this.resolveWorkspacePath(wsPath, task.workingDirectory || wsPath);
        const buildDir = this.resolveWorkspacePath(wsPath, task.buildDir || simConfig.buildDir);
        const flags = task.flags && task.flags.length > 0 ? task.flags : simConfig.defaultFlags;
        const waveformEnabled = task.waveform ?? true;
        const waveformFormat = task.waveformFormat || 'fst';
        const autoOpenWaveform = task.autoOpenWaveform ?? simConfig.autoOpenWaveform;

        const iverilogPath = task.iverilogPath || simConfig.iverilogPath;
        const vvpPath = task.vvpPath || simConfig.vvpPath;

        if (!(await this.ensureToolAvailable(iverilogPath, workingDir, 'simulation.iverilogPath', 'Icarus Verilog (iverilog)'))) {
            return;
        }
        if (!(await this.ensureToolAvailable(vvpPath, workingDir, 'simulation.vvpPath', 'VVP runtime'))) {
            return;
        }
        
        // 如果 sources 为空，我们自动把工程里的所有 HDL 目录和顶层文件加进去
        const includeDirSet = new Set<string>();
        const sourceFileSet = new Set<string>();

        projectManager.getIncludeDirsForWorkspace(resolvedWorkspaceUri).forEach(dir => includeDirSet.add(dir));
        
        const noSourcesConfigured = (!task.sources || task.sources.length === 0) && !task.filelist;
        if (noSourcesConfigured) {
            // 自动收集：利用 ProjectManager 的 includeDirs
            const topDef = projectManager.getModuleInWorkspace(task.top, resolvedWorkspaceUri);
            if (topDef) {
                sourceFileSet.add(topDef.fileUri.fsPath);
            } else {
                vscode.window.showErrorMessage(`Simulation skipped: Cannot find top module '${task.top}'.`);
                return;
            }

            const workspaceSources = await this.resolveSourceFiles(['**/*.{v,sv,vh,svh}'], resolvedWorkspaceUri);
            workspaceSources.forEach(source => sourceFileSet.add(source));
            this.outputChannel.appendLine(`[Sim] Auto-collected ${workspaceSources.length} HDL source file(s) from workspace.`);
        }

        if (task.sources && task.sources.length > 0) {
            // 用户配置了 sources: 支持 glob、相对路径、绝对路径
            const resolvedSources = await this.resolveSourceFiles(task.sources, resolvedWorkspaceUri);
            resolvedSources.forEach(source => sourceFileSet.add(source));
            this.outputChannel.appendLine(`[Sim] Resolved ${resolvedSources.length} source file(s) from task.sources.`);
        }

        if (task.filelist) {
            const filelists = Array.isArray(task.filelist) ? task.filelist : [task.filelist];
            for (const filelistPath of filelists) {
                const absFilelist = this.resolveWorkspacePath(wsPath, filelistPath);
                if (!fs.existsSync(absFilelist)) {
                    this.outputChannel.appendLine(`[Sim] Filelist not found: ${absFilelist}`);
                    continue;
                }

                const parsed = FilelistParser.parseDetailed(absFilelist);
                parsed.sourceFiles.forEach(source => sourceFileSet.add(source));
                parsed.includeDirs.forEach(dir => includeDirSet.add(dir));
                this.outputChannel.appendLine(`[Sim] Parsed filelist: ${path.basename(absFilelist)} (${parsed.sourceFiles.length} files)`);
            }
        }

        const srcFiles = Array.from(sourceFileSet)
            .sort((a, b) => a.localeCompare(b))
            .map(filePath => this.quotePath(filePath));

        const includeFlags = Array.from(includeDirSet)
            .sort((a, b) => a.localeCompare(b))
            .map(dir => `-y ${this.quotePath(dir)} -I ${this.quotePath(dir)}`);

        if (srcFiles.length === 0) {
            vscode.window.showErrorMessage(`Simulation skipped: No source files resolved for task '${task.name}'.`);
            return;
        }

        if (!fs.existsSync(buildDir)) {
            fs.mkdirSync(buildDir, { recursive: true });
        }

        if (task.tool === 'iverilog') {
            await this.runIverilog(
                task,
                workingDir,
                buildDir,
                srcFiles,
                includeFlags,
                flags,
                waveformEnabled,
                waveformFormat,
                autoOpenWaveform,
                iverilogPath,
                vvpPath
            );
        } else {
            vscode.window.showWarningMessage(`Simulator tool '${task.tool}' is not yet supported in this preview.`);
        }
    }

    private static async runIverilog(
        task: HdlSimTask, 
        workingDir: string,
        buildDir: string, 
        srcFiles: string[], 
        includeFlags: string[],
        flags: string[],
        waveformEnabled: boolean,
        waveformFormat: 'fst' | 'vcd',
        autoOpenWaveform: boolean,
        iverilogPath: string,
        vvpPath: string
    ) {
        this.outputChannel.show();
        this.outputChannel.clear();
        this.outputChannel.appendLine(`[Sim] Starting Icarus Verilog simulation for ${task.top}...`);

        const vvpFile = path.join(buildDir, `${task.top}.vvp`);
        
        let cmd = `${this.quotePath(iverilogPath)} ${flags.join(' ')} ${includeFlags.join(' ')} -o ${this.quotePath(vvpFile)} ${srcFiles.join(' ')}`;
        
        if (waveformEnabled && waveformFormat === 'fst') {
            // 如果开启 fst，这里其实靠 tb 内部的 $dumpfile, 但我们可以追加一个全局 define
            cmd += ` -DFST_DUMP`; 
        }

        this.outputChannel.appendLine(`[Sim] Compiling: ${cmd}`);

        try {
            await this.execPromise(cmd, workingDir);
            this.outputChannel.appendLine(`[Sim] Compilation successful.`);
            
            // 运行 VVP
            let runCmd = `${this.quotePath(vvpPath)} ${this.quotePath(vvpFile)}`;
            if (waveformEnabled && waveformFormat === 'fst') {
                runCmd += ` -fst`;
            }

            this.outputChannel.appendLine(`[Sim] Running: ${runCmd}`);
            const output = await this.execPromise(runCmd, workingDir);
            this.outputChannel.appendLine(output);
            this.outputChannel.appendLine(`[Sim] Simulation finished.`);

            // 如果配置了波形自动打开
            if (waveformEnabled) {
                const waveformPath = this.findWaveformFile(buildDir, task.top, waveformFormat);
                if (waveformPath) {
                    if (autoOpenWaveform) {
                        const action = await vscode.window.showInformationMessage(
                            `Simulation complete. Waveform ready: ${path.basename(waveformPath)}`,
                            'View Waveform'
                        );
                        if (action === 'View Waveform') {
                            await vscode.commands.executeCommand('hdl-helper.viewWaveform', waveformPath);
                        }
                    }
                } else {
                    vscode.window.showWarningMessage('Simulation completed, but no waveform file (.fst/.vcd) was found in build directory.');
                }
            }

        } catch (err: any) {
            this.outputChannel.appendLine(`[Error] Simulation failed:\n${err.message}`);
        }
    }

    private static async resolveSourceFiles(patterns: string[], workspaceUri: vscode.Uri): Promise<string[]> {
        const files = new Set<string>();
        const warnings: string[] = [];
        const excludeDirs = vscode.workspace
            .getConfiguration('hdl-helper', workspaceUri)
            .get<string[]>('project.excludeDirs') || ['node_modules', '.git'];
        const excludeGlob = excludeDirs.length > 0
            ? `**/{${excludeDirs.join(',')}}/**`
            : '**/{node_modules,.git}/**';

        for (const rawPattern of patterns) {
            const pattern = rawPattern?.trim();
            if (!pattern) {
                continue;
            }

            const normalizedPattern = pattern.replace(/\\/g, '/');
            const hasGlob = /[*?{}\[\]]/.test(normalizedPattern);

            // 1) glob pattern
            if (hasGlob) {
                let globPattern = normalizedPattern;

                // 绝对 glob 仅在其位于工作区内时转换为相对 glob。
                if (path.isAbsolute(pattern)) {
                    const relPattern = path.relative(workspaceUri.fsPath, pattern).replace(/\\/g, '/');
                    if (!relPattern.startsWith('..') && !path.isAbsolute(relPattern)) {
                        globPattern = relPattern;
                    } else {
                        warnings.push(`[Sim] Skip absolute glob outside workspace: ${pattern}`);
                        continue;
                    }
                }

                const uris = await vscode.workspace.findFiles(
                    new vscode.RelativePattern(workspaceUri, globPattern),
                    excludeGlob
                );

                if (uris.length === 0) {
                    warnings.push(`[Sim] No files matched glob: ${pattern}`);
                }

                for (const uri of uris) {
                    files.add(uri.fsPath);
                }
                continue;
            }

            // 2) explicit path (relative or absolute)
            const absPath = path.isAbsolute(pattern)
                ? pattern
                : path.join(workspaceUri.fsPath, pattern);

            if (!fs.existsSync(absPath)) {
                warnings.push(`[Sim] Source path not found: ${pattern}`);
                continue;
            }

            let stat: fs.Stats;
            try {
                stat = await fs.promises.stat(absPath);
            } catch {
                warnings.push(`[Sim] Failed to stat source path: ${pattern}`);
                continue;
            }

            if (stat.isDirectory()) {
                const dirFiles = await this.collectHdlFiles(absPath);
                if (dirFiles.length === 0) {
                    warnings.push(`[Sim] Directory has no HDL files: ${pattern}`);
                }
                for (const f of dirFiles) {
                    files.add(f);
                }
            } else {
                files.add(absPath);
            }
        }

        for (const msg of warnings) {
            this.outputChannel.appendLine(msg);
        }

        return Array.from(files)
            .sort((a, b) => a.localeCompare(b));
    }

    private static async collectHdlFiles(dirPath: string): Promise<string[]> {
        const out: string[] = [];
        const stack: string[] = [dirPath];
        const exts = new Set(['.v', '.sv', '.vh', '.svh']);

        while (stack.length > 0) {
            const current = stack.pop()!;
            let entries: fs.Dirent[];
            try {
                entries = await fs.promises.readdir(current, { withFileTypes: true });
            } catch {
                continue;
            }

            for (const entry of entries) {
                const fullPath = path.join(current, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name === 'node_modules' || entry.name === '.git') {
                        continue;
                    }
                    stack.push(fullPath);
                    continue;
                }

                if (entry.isFile() && exts.has(path.extname(entry.name).toLowerCase())) {
                    out.push(fullPath);
                }
            }
        }

        return out;
    }

    private static findWaveformFile(
        buildDir: string,
        topModule: string,
        preferredFormat?: 'vcd' | 'fst'
    ): string | undefined {
        const preferred = preferredFormat === 'vcd' ? 'vcd' : 'fst';
        const first = path.join(buildDir, `${topModule}.${preferred}`);
        if (fs.existsSync(first)) {
            return first;
        }

        const fallback = preferred === 'fst' ? 'vcd' : 'fst';
        const second = path.join(buildDir, `${topModule}.${fallback}`);
        if (fs.existsSync(second)) {
            return second;
        }

        // B3: 当 dumpfile 名与 top 不一致时，回退到 build 下“最新波形文件”
        try {
            const entries = fs.readdirSync(buildDir, { withFileTypes: true })
                .filter(entry => entry.isFile())
                .map(entry => path.join(buildDir, entry.name))
                .filter(filePath => {
                    const ext = path.extname(filePath).toLowerCase();
                    return ext === '.fst' || ext === '.vcd';
                });

            if (entries.length === 0) {
                return undefined;
            }

            const pickLatest = (candidateExt: '.fst' | '.vcd'): string | undefined => {
                const candidates = entries
                    .filter(filePath => path.extname(filePath).toLowerCase() === candidateExt)
                    .map(filePath => ({ filePath, mtime: fs.statSync(filePath).mtimeMs }))
                    .sort((a, b) => b.mtime - a.mtime);

                return candidates[0]?.filePath;
            };

            const preferredLatest = pickLatest(preferred === 'fst' ? '.fst' : '.vcd');
            if (preferredLatest) {
                return preferredLatest;
            }

            return pickLatest(fallback === 'fst' ? '.fst' : '.vcd');
        } catch {
            return undefined;
        }

        return undefined;
    }

    private static execPromise(command: string, cwd: string): Promise<string> {
        return new Promise((resolve, reject) => {
            cp.exec(
                command,
                {
                    cwd,
                    encoding: 'buffer',
                    maxBuffer: 20 * 1024 * 1024
                },
                (error, stdout, stderr) => {
                    const out = this.decodeMaybeGbk(stdout);
                    const err = this.decodeMaybeGbk(stderr);
                    if (error) {
                        reject(new Error(`${out}\n${err}`));
                    } else {
                        resolve(out);
                    }
                }
            );
        });
    }

    private static decodeMaybeGbk(raw: string | Buffer): string {
        if (typeof raw === 'string') {
            return raw;
        }

        const utf8Text = raw.toString('utf8');
        if (process.platform === 'win32' && utf8Text.includes('\ufffd')) {
            try {
                return iconv.decode(raw, 'gbk');
            } catch {
                return utf8Text;
            }
        }

        return utf8Text;
    }
}
