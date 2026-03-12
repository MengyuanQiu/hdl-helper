import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { HdlModule, HdlInstance, HdlPort, HdlParam, HdlSymbol, HdlSymbolKind } from './hdlSymbol';

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
     * 获取完整 AST 树对象，用于高级分析 (如 FSM)
     */
    public static getTree(text: string): any {
        if (!AstParser.ready) return null;
        try {
            return AstParser.parser.parse(text);
        } catch (err) {
            return null;
        }
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

        // 构造模块名字的 Range
        const nameRange = new vscode.Range(
            nameNode.startPosition.row,
            nameNode.startPosition.column,
            nameNode.endPosition.row,
            nameNode.endPosition.column
        );

        // 构造整个模块 Block 的 Range
        const bodyRange = new vscode.Range(
            node.startPosition.row,
            node.startPosition.column,
            node.endPosition.row,
            node.endPosition.column
        );

        const hdlModule = new HdlModule(moduleName, uri, bodyRange, nameRange);

        // 提取端口和参数
        AstParser.extractPortsAndParams(node, hdlModule);

        // 提取内部实例化
        AstParser.extractInstances(node, hdlModule, uri);

        // Phase 5: 提取模块内部所有信号符号（wire/reg/logic/integer/genvar）
        AstParser.extractSymbols(node, hdlModule, fullText, uri);

        // Phase 5.2: 提取所有的引用，填充到 HdlSymbol.references
        AstParser.extractReferences(node, hdlModule);

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
                        // 提取连接的端口
                        const connectedPorts: string[] = [];
                        const portList = child.children.find((c: any) => c.type === 'list_of_port_connections');
                        if (portList) {
                            AstParser.walkNode(portList, (pNode: any) => {
                                if (pNode.type === 'named_port_connection') {
                                    const portId = pNode.children.find((c: any) => c.type === 'port_identifier');
                                    if (portId) connectedPorts.push(portId.text);
                                }
                            });
                        }

                        hdlModule.addInstance(new HdlInstance(type, instName, range, uri, connectedPorts));
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

    // =================================================================
    // Phase 5: Symbol Table 提取
    // =================================================================

    /**
     * 节点类型 → HdlSymbolKind 的映射
     * Tree-sitter Verilog 的 net/variable declaration 节点类型可能的值
     */
    private static readonly DECL_NODE_TYPES: Record<string, HdlSymbolKind> = {
        'net_declaration':       'wire',
        'reg_declaration':       'reg',
        'data_declaration':      'logic',
        'integer_declaration':   'integer',
        'real_declaration':      'real',
        'genvar_declaration':    'genvar',
        'local_parameter_declaration': 'localparam',
    };

    /**
     * 从 module_declaration 中提取所有内部信号声明，填充到 hdlModule.symbols
     * "阅后即焚"策略：只提取轻量级 HdlSymbol，不保留 AST 节点引用
     */
    private static extractSymbols(
        moduleNode: any,
        hdlModule: HdlModule,
        fullText: string,
        uri: vscode.Uri
    ): void {
        const lines = fullText.split('\n');

        // 1. 将端口也加入符号表（kind='port'）
        for (const port of hdlModule.ports) {
            // 找端口在文本中的位置（用简单的文本搜索，因为端口的 AST
            // 节点已经在 extractPortsAndParams 中处理过了）
            const portRange = AstParser.findIdentifierRange(lines, port.name, moduleNode.startPosition.row);
            if (portRange) {
                const comment = AstParser.getCommentAbove(lines, portRange.start.line);
                const sym = new HdlSymbol(
                    port.name,
                    'port',
                    `${port.dir} ${port.type}`.trim(),
                    portRange,
                    uri,
                    comment
                );
                hdlModule.symbols.push(sym);
            }
        }

        // 2. 遍历 AST 提取 net/reg/data/integer/genvar 声明
        AstParser.walkNode(moduleNode, (node: any) => {
            const kind = AstParser.DECL_NODE_TYPES[node.type];
            if (!kind) return;

            // 提取该声明节点中的所有标识符
            AstParser.walkNode(node, (child: any) => {
                // 找到变量名标识符
                if (child.type === 'simple_identifier' && child.parent?.type !== node.type) {
                    // 为了避免将类型名当做变量名，检查父节点
                    const parentType = child.parent?.type || '';
                    if (
                        parentType.includes('identifier') ||
                        parentType.includes('variable') ||
                        parentType.includes('assignment') ||
                        parentType === 'list_of_net_decl_assignments' ||
                        parentType === 'list_of_variable_decl_assignments' ||
                        parentType === 'net_decl_assignment'
                    ) {
                        const name = child.text;
                        // 跳过已作为端口记录的符号
                        if (hdlModule.symbols.some(s => s.name === name)) return;

                        const symRange = new vscode.Range(
                            child.startPosition.row,
                            child.startPosition.column,
                            child.endPosition.row,
                            child.endPosition.column
                        );

                        // 提取声明行上方的注释
                        const comment = AstParser.getCommentAbove(lines, child.startPosition.row);

                        // 提取类型描述文本（包含位宽）
                        const typeTxt = node.text.split(name)[0]?.trim() || kind;

                        const sym = new HdlSymbol(name, kind, typeTxt, symRange, uri, comment);
                        hdlModule.symbols.push(sym);
                    }
                }
            });
        });

        // 3. 将参数也加入符号表
        for (const param of hdlModule.params) {
            const paramRange = AstParser.findIdentifierRange(lines, param.name, moduleNode.startPosition.row);
            if (paramRange) {
                const comment = AstParser.getCommentAbove(lines, paramRange.start.line);
                const sym = new HdlSymbol(
                    param.name,
                    'parameter',
                    `parameter ${param.name} = ${param.defaultValue}`,
                    paramRange,
                    uri,
                    comment
                );
                hdlModule.symbols.push(sym);
            }
        }
    }

    /**
     * Phase 5.2: 遍历 module 的所有标识符引用，关联到对应的 HdlSymbol
     */
    private static extractReferences(moduleNode: any, hdlModule: HdlModule): void {
        AstParser.walkNode(moduleNode, (node: any) => {
            // 我们只寻找 simple_identifier 和 port_identifier 节点（即引用点）
            if (node.type === 'simple_identifier' || node.type === 'port_identifier') {
                const name = node.text;

                // 排除作为声明的节点 (因为它们不是"引用"，但为了简化 FindAllReferences，加入也无妨)
                // 这里我们统统加入，让重命名和查找引用能够包含声明自身
                const sym = hdlModule.symbols.find(s => s.name === name);
                if (sym) {
                    const refRange = new vscode.Range(
                        node.startPosition.row,
                        node.startPosition.column,
                        node.endPosition.row,
                        node.endPosition.column
                    );
                    
                    // 去重：避免有些嵌套结构导致同一个范围被添加两次
                    if (!sym.references.some(r => r.isEqual(refRange))) {
                        sym.references.push(refRange);
                    }
                }
            }
        });
    }

    /**
     * 提取指定行上方 1-2 行的注释文本
     * 支持 // 和 block comment 风格
     */
    private static getCommentAbove(lines: string[], lineIndex: number): string | undefined {
        const comments: string[] = [];

        for (let i = lineIndex - 1; i >= Math.max(0, lineIndex - 2); i--) {
            const trimmed = lines[i]?.trim() || '';
            if (trimmed.startsWith('//')) {
                comments.unshift(trimmed.replace(/^\/\/\s*/, ''));
            } else if (trimmed.endsWith('*/')) {
                // 单行 /* ... */
                const blockMatch = trimmed.match(/\/\*\s*(.*?)\s*\*\//);
                if (blockMatch) {
                    comments.unshift(blockMatch[1]);
                }
            } else {
                break; // 非注释行，停止向上搜索
            }
        }

        return comments.length > 0 ? comments.join(' ') : undefined;
    }

    /**
     * 在文本中简单查找某个标识符的第一次出现位置（从 startRow 开始）
     */
    private static findIdentifierRange(
        lines: string[],
        name: string,
        startRow: number
    ): vscode.Range | null {
        const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        for (let i = startRow; i < lines.length && i < startRow + 200; i++) {
            const match = regex.exec(lines[i] || '');
            if (match) {
                return new vscode.Range(i, match.index, i, match.index + name.length);
            }
        }
        return null;
    }
}
