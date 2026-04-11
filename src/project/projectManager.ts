import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FastParser } from './fastParser';
import { AstParser } from './astParser';
import { HdlModule } from './hdlSymbol';
import { FilelistParser } from './filelistParser';
import { FileReader } from '../utils/fileReader';
import { HdlWorkspace } from './hdlWorkspace';

export class ProjectManager {
    // 核心存储: 工作区路径 -> HdlWorkspace 实例
    private workspaces = new Map<string, HdlWorkspace>();

    private outputChannel: vscode.OutputChannel;

    private scanning = false;
    private lastScanSummary = {
        workspaceCount: 0,
        fileCount: 0,
        moduleCount: 0,
        lastError: ''
    };

    private _onDidChangeScanState: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidChangeScanState: vscode.Event<void> = this._onDidChangeScanState.event;

    constructor(private extensionUri: vscode.Uri, outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        // 监听变动
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.{v,sv,vh,svh}');
        watcher.onDidCreate(uri => { console.log(`[File Create] ${uri.fsPath}`); this.updateFile(uri); });
        watcher.onDidChange(uri => { console.log(`[File Change] ${uri.fsPath}`); this.updateFile(uri); });
        watcher.onDidDelete(uri => this.removeFile(uri));
    }

    /**
     * 根据文件 URI 获取所属的 Workspace
     */
    private getWorkspaceForUri(uri: vscode.Uri): HdlWorkspace | undefined {
        const wf = vscode.workspace.getWorkspaceFolder(uri);
        if (wf) {
            return this.workspaces.get(wf.uri.fsPath);
        }
        // Fallback: 如果不在任何标准 workspace folder 内，但已打开工作区
        if (this.workspaces.size > 0) {
            return this.workspaces.values().next().value;
        }
        return undefined;
    }

    /**
     * 确保工作区存在
     */
    private ensureWorkspace(folder: vscode.WorkspaceFolder): HdlWorkspace {
        const wsPath = folder.uri.fsPath;
        if (!this.workspaces.has(wsPath)) {
            this.workspaces.set(wsPath, new HdlWorkspace(folder.name, folder.uri));
        }
        return this.workspaces.get(wsPath)!;
    }

    /**
     * 异步初始化 AstParser (Tree-sitter WASM)
     * 应在 scanWorkspace() 之前调用，但不需要 await —— AstParser 会在后台加载
     */
    public initAstParser(): void {
        AstParser.initialize(this.extensionUri, this.outputChannel).catch(e => {
            this.outputChannel.appendLine(`[ProjectManager] AstParser init error: ${e}`);
        });
    }

    public async scanWorkspace() {
        if (!vscode.workspace.workspaceFolders) {return;}

        this.scanning = true;
        this.lastScanSummary.lastError = '';
        this._onDidChangeScanState.fire();

        this.workspaces.clear();

        let scannedFiles = 0;

        try {
            for (const folder of vscode.workspace.workspaceFolders) {
                const ws = this.ensureWorkspace(folder);
                ws.clear();
                
                console.log(`[Step 1] 开始搜索项目索引... (${ws.name})`);

                // 获取排除目录配置
                const config = vscode.workspace.getConfiguration('hdl-helper', folder.uri);
                const excludeDirs = config.get<string[]>('project.excludeDirs') || ['node_modules', '.srcs', '.sim', 'ip'];
                const filelistPatterns = config.get<string[]>('project.filelistPatterns') || ['**/*.f', '**/*.flist'];
                const excludePattern = new vscode.RelativePattern(folder, excludeDirs.length > 0 ? `**/{${excludeDirs.join(',')}}/**` : '**/node_modules/**');

                // 1. 优先查找 .f 文件
                const fFileSet = new Set<string>();
                for (const pattern of filelistPatterns) {
                    const uris = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, pattern), excludePattern);
                    uris.forEach(uri => fFileSet.add(uri.fsPath));
                }

                const fFiles = Array.from(fFileSet).map(fsPath => vscode.Uri.file(fsPath));
                let filesToScan: vscode.Uri[] = [];

                if (fFiles.length > 0) {
                    console.log(`[Step 1.1] 发现 ${fFiles.length} 个 .f 文件，进入 Filelist 模式。`);
                    const rawPaths = new Set<string>();
                    const includeDirs = new Set<string>();

                    for (const fUri of fFiles) {
                        const parsed = await FilelistParser.parseDetailed(fUri.fsPath);
                        parsed.sourceFiles.forEach(p => rawPaths.add(p));
                        parsed.includeDirs.forEach(dir => includeDirs.add(dir));
                        parsed.libraryDirs.forEach(dir => includeDirs.add(dir));
                    }

                    filesToScan = Array.from(rawPaths)
                        .filter(p => fs.existsSync(p))
                        .map(p => vscode.Uri.file(p));

                    // filelist 模式下优先采用 filelist 自带 include / library 目录
                    ws.includeDirs = Array.from(includeDirs);
                } else {
                    console.log(`[Step 1.2] 未发现 .f，全量扫描 (.v, .sv)。`);
                    const sourceFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, '**/*.{v,sv}'), excludePattern);
                    const headerFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, '**/*.{vh,svh}'), excludePattern);
                    
                    filesToScan = [...sourceFiles, ...headerFiles];
                    ws.includeDirs = Array.from(new Set(headerFiles.map(u => path.dirname(u.fsPath))));
                }

                console.log(`[Step 2] 收集到 ${filesToScan.length} 源文件，解析模块...`);
                scannedFiles += filesToScan.length;

                // 分块解析防 OOM
                const chunkSize = 50;
                for (let i = 0; i < filesToScan.length; i += chunkSize) {
                    const chunk = filesToScan.slice(i, i + chunkSize);
                    await Promise.all(chunk.map(file => this.parseAndCache(file, ws)));
                }
            }

            this.lastScanSummary = {
                workspaceCount: this.workspaces.size,
                fileCount: scannedFiles,
                moduleCount: this.getAllModules().length,
                lastError: ''
            };
        } catch (error: any) {
            this.lastScanSummary.lastError = `${error}`;
            this.outputChannel.appendLine(`[ProjectManager] scanWorkspace failed: ${error}`);
        } finally {
            this.scanning = false;
            this._onDidChangeScanState.fire();
            this.refreshTree();
        }

        console.log(`[Step 3] 扫描结束，刷新 UI。`);
    }

    private async parseAndCache(uri: vscode.Uri, ws?: HdlWorkspace) {
        if (!ws) {
            ws = this.getWorkspaceForUri(uri);
            if (!ws) {return;} 
        }

        const fsPath = uri.fsPath;
        try {
            const text = await FileReader.readFile(uri);

            let hdlModules = AstParser.ready ? AstParser.parse(text, uri) : [];
            
            // 补充修复: 如果 Tree-sitter 因为头部语法稍微不标准 (如 import 包) 导致未能提取到端口/参数
            // 使用增强版 FastParser 提取出的结果进行补充，同时保留 AstParser 提取的内部 symbols
            const fastModules = FastParser.parse(text, uri);
            if (hdlModules.length === 0) {
                hdlModules = fastModules;
            } else {
                for (const hm of hdlModules) {
                    if (hm.ports.length === 0 && hm.params.length === 0) {
                        const fm = fastModules.find(f => f.name === hm.name);
                        if (fm && (fm.ports.length > 0 || fm.params.length > 0)) {
                            hm.ports = fm.ports;
                            hm.params = fm.params;
                        }
                    }
                }
            }

            if (hdlModules.length > 0) {
                const modNames: string[] = [];
                for (const hdlModule of hdlModules) {
                    ws.moduleMap.set(hdlModule.name, hdlModule);
                    modNames.push(hdlModule.name);
                }
                
                if (!ws.fileMap.has(fsPath)) {ws.fileMap.set(fsPath, []);}
                const list = ws.fileMap.get(fsPath)!;
                modNames.forEach(n => { if (!list.includes(n)) {list.push(n);} });
            }
        } catch (error) {
            console.error(`[Error] 读取失败: ${uri.fsPath}`, error);
        }
    }

    private async updateFile(uri: vscode.Uri) {
        this.removeFile(uri);             
        await this.parseAndCache(uri);    
        this.refreshTree();               
    }

    private removeFile(uri: vscode.Uri) {
        const ws = this.getWorkspaceForUri(uri);
        if (!ws) {return;}

        const fsPath = uri.fsPath;
        const moduleNames = ws.fileMap.get(fsPath);

        if (moduleNames) {
            moduleNames.forEach(name => {
                ws.moduleMap.delete(name);
            });
            ws.fileMap.delete(fsPath);
        }
        this.refreshTree();
    }

    public getAllModules(): HdlModule[] {
        let all: HdlModule[] = [];
        for (const ws of this.workspaces.values()) {
            all = all.concat(Array.from(ws.moduleMap.values()));
        }
        return all;
    }

    public getModule(name: string): HdlModule | undefined {
        for (const ws of this.workspaces.values()) {
            if (ws.moduleMap.has(name)) {return ws.moduleMap.get(name);}
        }
        return undefined;
    }

    public getModuleInWorkspace(name: string, sourceUri?: vscode.Uri): HdlModule | undefined {
        if (sourceUri) {
            const ws = this.getWorkspaceForUri(sourceUri);
            if (ws?.moduleMap.has(name)) {
                return ws.moduleMap.get(name);
            }
        }

        return this.getModule(name);
    }

    public getModulesInFile(filePath: string): HdlModule[] {
        const result: HdlModule[] = [];
        for (const ws of this.workspaces.values()) {
            const modNames = ws.fileMap.get(filePath);
            if (modNames) {
                modNames.forEach(name => {
                    const m = ws.moduleMap.get(name);
                    if (m) {result.push(m);}
                });
                return result; 
            }
        }
        return result;
    }

    public getIncludeDirs(): string[] {
        let all: string[] = [];
        for (const ws of this.workspaces.values()) {
            all = all.concat(ws.includeDirs);
        }
        return Array.from(new Set(all));
    }

    public getIncludeDirsForWorkspace(sourceUri?: vscode.Uri): string[] {
        if (sourceUri) {
            const ws = this.getWorkspaceForUri(sourceUri);
            if (ws) {
                return Array.from(new Set(ws.includeDirs));
            }
        }

        return this.getIncludeDirs();
    }

    public isScanning(): boolean {
        return this.scanning;
    }

    public getLastScanSummary(): { workspaceCount: number; fileCount: number; moduleCount: number; lastError: string } {
        return this.lastScanSummary;
    }

    // --- UI State (Top Module) ---

    public setTopModule(moduleName: string) {
        for (const ws of this.workspaces.values()) {
            if (ws.moduleMap.has(moduleName)) {
                ws.topModule = moduleName;
                this.refreshTree();
                return;
            }
        }
    }

    public clearTopModule() {
        for (const ws of this.workspaces.values()) {
            ws.topModule = null;
        }
        this.refreshTree();
    }

    public getTopModule(): HdlModule | undefined {

        for (const ws of this.workspaces.values()) {
            if (ws.topModule && ws.moduleMap.has(ws.topModule)) {
                return ws.moduleMap.get(ws.topModule);
            }
        }

        const instantiated = new Set<string>();
        for (const ws of this.workspaces.values()) {
            for (const mod of ws.moduleMap.values()) {
                mod.instances.forEach(i => instantiated.add(i.type));
            }
        }

        let bestCandidate: HdlModule | undefined;
        let maxInstances = -1;

        for (const ws of this.workspaces.values()) {
            for (const mod of ws.moduleMap.values()) {
                if (!instantiated.has(mod.name)) {
                    if (mod.instances.length > maxInstances) {
                        maxInstances = mod.instances.length;
                        bestCandidate = mod;
                    }
                }
            }
        }

        return bestCandidate;
    }

    // --- Tree Data Provider 事件交互 ---
    private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

    public refreshTree() {
        this._onDidChangeTreeData.fire();
    }
}
