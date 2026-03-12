import * as vscode from 'vscode';
import * as path from 'path';
import { LintManager } from './linter/LintManager';
import VerilogFormatter from './formatter';
import * as cp from 'child_process';
// 引入原有的功能函数
import { generateTestbench } from './commands/generateTB';
import { instantiateModule } from './commands/instantiateModule';
import { autoDeclareSignals } from './commands/autoDeclare';
import { activateLanguageServer, deactivateLanguageServer } from './languageClient';
// 引入 V2.0 工程核心
import { ProjectManager } from './project/projectManager';
import { HdlTreeProvider } from './project/hdlTreeProvider';
import { HdlModule } from './project/hdlSymbol';
import { VerilogDefinitionProvider } from './providers/defProvider';
import { VerilogHoverProvider } from './providers/hoverProvider';
import { CodeGenerator } from './utils/codeGenerator'
import { DocGenerator } from './utils/docGenerator'


// 全局变量，方便 deactivate 使用
let projectManager: ProjectManager;
export function activate(context: vscode.ExtensionContext) {
    console.log('HDL Helper is active!');

    // =========================================================================
    // 1. 核心初始化 (顺序很重要！)
    // =========================================================================
    
    // A. 初始化工程管理器（先于 LintManager，供 VerilatorEngine 查询工程目录）
    const logChannel = vscode.window.createOutputChannel('HDL Helper AST');
    projectManager = new ProjectManager(context.extensionUri, logChannel);

    // A2. 在后台异步初始化 Tree-sitter AST 引擎（不阻塞主流程）
    projectManager.initAstParser();
    projectManager.scanWorkspace(); // 启动后台扫描

    // B. 启动多引擎 Linter，传入 projectManager（供 Verilator 注入 Include 路径）
    const lintManager = new LintManager(projectManager);
    lintManager.activate(context.subscriptions);


    // C. 初始化 Tree Provider
    const treeProvider = new HdlTreeProvider(projectManager);
    
    // D. 注册侧边栏视图
    vscode.window.registerTreeDataProvider(
        'hdl-hierarchy-view', 
        treeProvider
    );

    // =========================================================================
    // 2. 注册 Formatter (格式化)
    // =========================================================================
    const formatter = new VerilogFormatter();
    const formatProvider = vscode.languages.registerDocumentFormattingEditProvider(
        ['verilog', 'systemverilog'],
        formatter
    );
    context.subscriptions.push(formatProvider);

    // =========================================================================
    // 3. 注册功能命令 (Commands)
    // =========================================================================

    // --- A. 生成 Testbench (升级版：支持右键菜单) ---
    // 逻辑：如果是右键树节点触发的，先打开那个文件，再调用原来的生成逻辑
    const genTBCmd = vscode.commands.registerCommand('hdl-helper.generateTB', async (item?: HdlModule) => {
        try { 
            if (item && item.fileUri) {
                // 如果是从树形菜单点击的，先打开该文件
                await vscode.window.showTextDocument(item.fileUri);
            }
            // 复用之前的逻辑
            await generateTestbench(); 
        } catch (e) { 
            vscode.window.showErrorMessage(`TB 生成失败: ${e}`); 
        }
    });
    context.subscriptions.push(genTBCmd);

    // --- B. 智能例化 (Ctrl+Alt+I) ---
    const instCmd = vscode.commands.registerCommand('hdl-helper.instantiate', async () => {
        try { await instantiateModule(); } catch (e) { vscode.window.showErrorMessage(`${e}`); }
    });
    context.subscriptions.push(instCmd);

    // --- C. 自动声明信号 (Ctrl+Alt+W) ---
    const autoWireCmd = vscode.commands.registerCommand('hdl-helper.createSignals', async () => {
        try { await autoDeclareSignals(); } catch (e) { vscode.window.showErrorMessage(`${e}`); }
    });
    context.subscriptions.push(autoWireCmd);

    // D. 复制实例化模板 (树节点右键)
    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.copyInstantiation', async (item: HdlModule) => {
        if (!item || !(item instanceof HdlModule)) return;

        // 调用统一生成器 (这里可以选择不带注释，保持清爽，或者设为 true 也带注释)
        const finalCode = CodeGenerator.generateInstantiation(item, false);

        await vscode.env.clipboard.writeText(finalCode);
        vscode.window.showInformationMessage(`已复制 ${item.name} 实例化模板！`);
    }));

    // --- E. 工程管理命令 (Set/Clear Top) ---
    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.setTopModule', (item: HdlModule) => {
        if (item && item.name) {
            treeProvider.setTopModule(item.name);
            vscode.window.showInformationMessage(`Top Module set to: ${item.name}`);
        } else {
            vscode.window.showErrorMessage("只能将模块定义设为 Top");
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.clearTopModule', () => {
        treeProvider.setTopModule(null);
        vscode.window.showInformationMessage(`已清除 Top Module 设置`);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.refreshProject', () => {
        projectManager.scanWorkspace();
        treeProvider.refresh();
    }));

    // =========================================================================
    // 5. 注册跳转定义 (Go to Definition)
    // =========================================================================
    const defProvider = new VerilogDefinitionProvider(projectManager);
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(
            ['verilog', 'systemverilog'],
            defProvider
        )
    );

    // =========================================================================
    // 6. 注册悬停提示 (Hover)
    // =========================================================================
    const hoverProvider = new VerilogHoverProvider(projectManager);
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            ['verilog', 'systemverilog'],
            hoverProvider
        )
    );

    // --- F. 调试命令 ---
    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.debugProject', () => {
        const modules = projectManager.getAllModules();
        vscode.window.showInformationMessage(`工程中共有 ${modules.length} 个模块。`);
        vscode.commands.executeCommand('workbench.debug.action.toggleRepl');
        modules.forEach(m => console.log(`📦 ${m.name} (${path.basename(m.fileUri.fsPath)})`));
    }));

    // G. 生成接口文档 (Markdown) - 右键菜单触发
    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.generateDoc', async (item: HdlModule) => {
        if (!item || !(item instanceof HdlModule)) return;

        try {
            // 1. 生成 Markdown 内容
            const mdContent = DocGenerator.generateMarkdown(item);

            // 2. 创建一个虚拟的 Markdown 文档
            const doc = await vscode.workspace.openTextDocument({
                content: mdContent,
                language: 'markdown'
            });

            // 3. 在侧边栏显示 (ViewColumn.Beside)
            await vscode.window.showTextDocument(doc, {
                preview: false, // 不作为预览模式，而是可编辑的新文件
                viewColumn: vscode.ViewColumn.Beside
            });
        } catch (e) {
            vscode.window.showErrorMessage(`生成文档失败: ${e}`);
        }
    }));

    // =========================================================================
    // 修复后的命令：查看 Linter 规则帮助
    // =========================================================================
    context.subscriptions.push(vscode.commands.registerCommand('hdl-helper.listLintRules', async () => {
        const config = vscode.workspace.getConfiguration('hdl-helper');
        let binPath = config.get<string>('linter.veriblePath') || 'verible-verilog-lint';
        
        // 1. Windows 路径修正
        if (process.platform === 'win32') {
             if (!binPath.toLowerCase().endsWith('.exe')) {
                 if (path.isAbsolute(binPath) || binPath.includes('\\') || binPath.includes('/')) {
                     binPath += '.exe';
                 }
             }
        }

        vscode.window.setStatusBarMessage('$(sync~spin) 正在获取 Verible 规则列表...', 2000);

        // 2. 构造 Shell 命令
        // [修复] 必须显式加上 =all，否则 Google 的参数解析库会报 "Missing value"
        const cmd = `"${binPath}" --help_rules=all`;

        // console.log(`[Exec] ${cmd}`); 

        cp.exec(cmd, (err, stdout, stderr) => {
            if (err && (err as any).code === 127) { 
                vscode.window.showErrorMessage(`无法找到 Verible 工具: ${binPath}`);
                return;
            }

            const output = stdout.trim() || stderr.trim();

            if (output) {
                vscode.workspace.openTextDocument({
                    content: output,
                    language: 'markdown' 
                }).then(doc => {
                    vscode.window.showTextDocument(doc, { preview: false });
                });
            } else {
                vscode.window.showErrorMessage(`获取失败。请尝试在终端运行: "${binPath}" --help_rules=all`);
            }
        });
    }));


    // =========================================================================
    // 4. 启动 Language Server
    // =========================================================================
    activateLanguageServer(context);
}

export function deactivate() {
    return deactivateLanguageServer();
}