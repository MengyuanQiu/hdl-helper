import * as vscode from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    StreamInfo
} from 'vscode-languageclient/node';
import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';
import { runVeribleFormat } from './formatter'; 

let client: LanguageClient;

export function activateLanguageServer(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('hdl-helper');
    if (!config.get<boolean>('languageServer.enabled')) {return;}

    let serverPath = config.get<string>('languageServer.path') || 'verible-verilog-ls';

    // Windows 路径修正
    if (process.platform === 'win32') {
         if (!serverPath.toLowerCase().endsWith('.exe')) {
             if (path.isAbsolute(serverPath) || serverPath.includes('\\')) {
                 serverPath += '.exe';
             }
         }
    }

    if (path.isAbsolute(serverPath) && !fs.existsSync(serverPath)) {
        console.warn(`[LSP] Binary not found: ${serverPath}`); 
    }

    const outputChannel = vscode.window.createOutputChannel('HDL Helper LSP');

    const serverOptions: ServerOptions = async (): Promise<StreamInfo> => {
        const cwd = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        
        // =================================================================
        // [绝杀修复 2.0] 批量禁用 LSP 的干扰规则
        // =================================================================
        // 我们不希望 LSP 对代码风格指手画脚，这些全部交给 lint.ts 和 formatter.ts
        // 这里的减号 "-" 表示禁用该规则
        const disabledRules = [
            '-line-length',              // 禁用行宽检查
            '-parameter-name-style',     // 禁用参数命名检查 (你刚才遇到的)
            '-no-tabs',                  // 禁用 Tab 检查
            '-no-trailing-spaces',       // 禁用尾部空格检查
            '-generate-label',           // 禁用 generate 标签检查 (可选)
            '-always-comb'               // 禁用组合逻辑写法检查 (可选)
        ];

        const args = [
            `--rules=${disabledRules.join(',')}`, // 拼接成参数字符串
            '--rules_config_search=false'         // 禁止搜索 .rules 文件
        ]; 

        const child = cp.spawn(serverPath, args, { 
            cwd: cwd, 
            env: process.env, 
            shell: false 
        });
        
        child.on('error', err => outputChannel.appendLine(`[Error] ${err.message}`));
        
        return Promise.resolve({
            reader: child.stdout!, 
            writer: child.stdin!
        });
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: 'file', language: 'verilog' },
            { scheme: 'file', language: 'systemverilog' }
        ],
        outputChannel: outputChannel,
        
        middleware: {
            provideDocumentFormattingEdits: async (document, options, token, next) => {
                return await runVeribleFormat(document, options, token);
            },
            handleDiagnostics: (uri, diagnostics, next) => {
                next(uri, []); 
            }
        }
    };

    client = new LanguageClient('veribleLS', 'Verible LS', serverOptions, clientOptions);
    client.start().catch(e => console.error(e));
}

export function deactivateLanguageServer() {
    return client ? client.stop() : undefined;
}