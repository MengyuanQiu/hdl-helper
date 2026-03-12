import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { HdlModule, HdlInstance, HdlPort, HdlParam } from './hdlSymbol';

// 动态 require web-tree-sitter (在 VS Code Extension Host 中运行)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Parser = require('web-tree-sitter');

/**
 * AstParser: 基于 Tree-sitter WASM 的精准 AST 解析器
 * 
 * 架构设计:
 *   - 单例模式，通过 initialize() 异步初始化
 *   - 初始化完成前，调用方应回退到 FastParser（正则保底）
 *   - WASM 文件从 extension 的 resources/ 目录加载，直接打包进 .vsix
 */
export class AstParser {
    private static parser: any = null;
    private static isInitializing = false;
    private static isReady = false;
    private static outputChannel: vscode.OutputChannel | undefined;

    /**
     * 异步初始化 Parser（只需调用一次）
     * @param extensionUri 通过 context.extensionUri 传入
     * @param channel 用于输出日志的 OutputChannel（可选）
     */
    public static async initialize(
        extensionUri: vscode.Uri,
        channel?: vscode.OutputChannel
    ): Promise<void> {
        // 防止并发重入
        if (AstParser.isReady || AstParser.isInitializing) return;
        AstParser.isInitializing = true;
        AstParser.outputChannel = channel;

        try {
            // 1. 定位两个 WASM 文件的路径
            const treeSitterWasmPath = vscode.Uri.joinPath(
                extensionUri,
                'resources',
                'web-tree-sitter.wasm'
            ).fsPath;
            const verilogWasmPath = vscode.Uri.joinPath(
                extensionUri,
                'resources',
                'tree-sitter-verilog.wasm'
            ).fsPath;

            // 2. 验证文件存在
            if (!fs.existsSync(treeSitterWasmPath) || !fs.existsSync(verilogWasmPath)) {
                AstParser.log('[AstParser] ❌ WASM files not found in resources/. Falling back to FastParser.');
                return;
            }

            AstParser.log('[AstParser] 🔧 Initializing Tree-sitter...');

            // 3. 初始化 web-tree-sitter 引擎本身
            await Parser.init({
                locateFile: (file: string) => {
                    // web-tree-sitter 需要找到自己的 .wasm 文件
                    if (file === 'tree-sitter.wasm') {
                        return treeSitterWasmPath;
                    }
                    return file;
                }
            });

            // 4. 加载 Verilog 语言语法 WASM
            const VerilogLang = await Parser.Language.load(verilogWasmPath);

            // 5. 创建 Parser 实例并设置语言
            AstParser.parser = new Parser();
            AstParser.parser.setLanguage(VerilogLang);

            AstParser.isReady = true;
            AstParser.log('[AstParser] ✅ Tree-sitter ready. AST parsing is now active.');
        } catch (err) {
            AstParser.log(`[AstParser] ⚠️ Initialization failed: ${err}. Falling back to FastParser.`);
            AstParser.parser = null;
        } finally {
            AstParser.isInitializing = false;
        }
    }

    /**
     * 是否已就绪（可以使用 AST 解析）
     */
    public static get ready(): boolean {
        return AstParser.isReady && AstParser.parser !== null;
    }

    /**
     * 使用 Tree-sitter 解析文件文本，返回所有模块定义
     * @param text 文件内容（已解码的字符串）
     * @param uri 文件 URI（用于构造 Range 和 HdlModule）
     */
    public static parse(text: string, uri: vscode.Uri): HdlModule[] {
        if (!AstParser.ready) {
            return []; // 未就绪，交给调用方回退到 FastParser
        }

        const modules: HdlModule[] = [];

        try {
            const tree = AstParser.parser.parse(text);
            const root = tree.rootNode;

            // 遍历根节点，找所有 module_declaration
            for (const node of root.children) {
                if (node.type === 'module_declaration') {
                    const hdlModule = AstParser.extractModule(node, text, uri);
                    if (hdlModule) {
                        modules.push(hdlModule);
                    }
                }
            }
        } catch (err) {
            AstParser.log(`[AstParser] Parse error for ${path.basename(uri.fsPath)}: ${err}`);
        }

        return modules;
    }

    /**
     * 从 module_declaration AST 节点提取 HdlModule
     */
    private static extractModule(
        node: any,
        fullText: string,
        uri: vscode.Uri
    ): HdlModule | null {
        // 找到 module_keyword 同级的 module_identifier
        let moduleName: string | null = null;
        let nameNode: any = null;

        for (const child of node.children) {
            if (child.type === 'module_identifier' || child.type === 'simple_identifier') {
                moduleName = child.text;
                nameNode = child;
                break;
            }
        }

        if (!moduleName || !nameNode) return null;

        // 构造模块所在 Range（行列号，0-indexed）
        const moduleRange = new vscode.Range(
            nameNode.startPosition.row,
            nameNode.startPosition.column,
            nameNode.endPosition.row,
            nameNode.endPosition.column
        );

        const hdlModule = new HdlModule(moduleName, uri, moduleRange);

        // 提取端口和参数
        AstParser.extractPortsAndParams(node, hdlModule);

        // 提取内部实例化
        AstParser.extractInstances(node, hdlModule, uri);

        return hdlModule;
    }

    /**
     * 从 module_declaration 中递归提取端口和参数
     */
    private static extractPortsAndParams(moduleNode: any, hdlModule: HdlModule): void {
        AstParser.walkNode(moduleNode, (node: any) => {
            // 提取端口: ansi_port_declaration, port_declaration
            if (node.type === 'ansi_port_declaration' || node.type === 'port_declaration') {
                const port = AstParser.parsePortNode(node);
                if (port) hdlModule.addPort(port);
            }
            // 提取参数: parameter_declaration
            if (node.type === 'parameter_declaration') {
                const params = AstParser.parseParamNode(node);
                params.forEach(p => hdlModule.addParam(p));
            }
        });
    }

    /**
     * 从 module_declaration 中递归提取实例化
     */
    private static extractInstances(moduleNode: any, hdlModule: HdlModule, uri: vscode.Uri): void {
        AstParser.walkNode(moduleNode, (node: any) => {
            if (node.type === 'module_instantiation') {
                const typeNode = node.children.find((c: any) =>
                    c.type === 'module_identifier' || c.type === 'simple_identifier'
                );
                const type = typeNode?.text;
                if (!type) return;

                // 找所有 hierarchical_instance (可能一次实例化多个 u_a, u_b)
                for (const child of node.children) {
                    if (child.type === 'hierarchical_instance') {
                        const nameNode = child.children.find((c: any) =>
                            c.type === 'name_of_instance' || c.type === 'instance_identifier'
                        );
                        const instName = nameNode?.text ?? 'unnamed';
                        const range = new vscode.Range(
                            child.startPosition.row,
                            child.startPosition.column,
                            child.startPosition.row,
                            child.startPosition.column + instName.length
                        );
                        hdlModule.addInstance(new HdlInstance(type, instName, range, uri));
                    }
                }
            }
        });
    }

    /**
     * 解析 ansi_port_declaration 节点，返回 HdlPort
     */
    private static parsePortNode(node: any): HdlPort | null {
        let dir = 'input';
        let type = '';
        let name = '';

        for (const child of node.children) {
            if (['input', 'output', 'inout'].includes(child.text?.toLowerCase())) {
                dir = child.text.toLowerCase();
            }
            if (child.type === 'net_type' || child.type === 'data_type') {
                type = child.text;
            }
            if (child.type === 'port_identifier' || child.type === 'simple_identifier') {
                name = child.text;
            }
        }

        return name ? new HdlPort(name, dir, type.trim()) : null;
    }

    /**
     * 解析 parameter_declaration 节点，返回 HdlParam[]（一行可有多个参数）
     */
    private static parseParamNode(node: any): HdlParam[] {
        const params: HdlParam[] = [];

        AstParser.walkNode(node, (child: any) => {
            if (child.type === 'param_assignment') {
                const nameNode = child.children.find((c: any) =>
                    c.type === 'parameter_identifier' || c.type === 'simple_identifier'
                );
                const valNode = child.children.find((c: any) =>
                    c.type === 'constant_expression' || c.type === 'expression'
                );
                if (nameNode) {
                    params.push(new HdlParam(nameNode.text, valNode?.text ?? ''));
                }
            }
        });

        return params;
    }

    /**
     * 深度优先遍历 AST 节点，对每个节点调用 visitor 回调
     * 注意：不能使用递归遍历 module_declaration 内部的嵌套 module（避免跨模块污染）
     */
    private static walkNode(node: any, visitor: (n: any) => void): void {
        const stack: any[] = [node];
        while (stack.length > 0) {
            const current = stack.pop();
            visitor(current);
            if (current.children) {
                for (let i = current.children.length - 1; i >= 0; i--) {
                    stack.push(current.children[i]);
                }
            }
        }
    }

    private static log(msg: string): void {
        if (AstParser.outputChannel) {
            AstParser.outputChannel.appendLine(msg);
        }
        console.log(msg);
    }
}
