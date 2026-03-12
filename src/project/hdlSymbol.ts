import * as vscode from 'vscode';

/**
 * 模块类型：是 Verilog 还是 SystemVerilog，或者是 Testbench
 */
export enum HdlModuleType {
    Module,
    Interface,
    Package,
    Testbench // 简单的启发式判断：没有端口的 module
}

/**
 * 代表模块内部的一个信号/变量符号
 * 用于信号级 Go to Definition、Find All References、Rename (F2)、Rich Hover
 */
export type HdlSymbolKind = 'wire' | 'reg' | 'logic' | 'parameter' | 'localparam' | 'genvar' | 'integer' | 'real' | 'port' | 'unknown';

export class HdlSymbol {
    /** 该符号在文件中被引用的所有位置（由 AstParser 填充） */
    public references: vscode.Range[] = [];

    constructor(
        public name: string,       // 信号名
        public kind: HdlSymbolKind,// 类型
        public type: string,       // 位宽/类型描述，如 "wire [31:0]"
        public range: vscode.Range,// 声明位置
        public fileUri: vscode.Uri,// 所在文件
        public comment?: string    // 声明上方 1-2 行的注释 (用于 Rich Hover)
    ) {}
}

/**
 * 1. 新增：代表一个参数
 * 例如: parameter DATA_WIDTH = 32
 */
export class HdlParam {
    constructor(
        public name: string,       // DATA_WIDTH
        public defaultValue: string // 32
    ) {}
}

/**
 * 代表一个端口
 * 例如: input wire [7:0] data_in
 */
export class HdlPort {
    constructor(
        public name: string, // data_in
        public dir: string,  // input, output, inout
        public type: string  // wire [7:0], logic, reg [3:0] 等 (简化处理)
    ) {}
}

/**
 * 代表一个实例化对象
 * 例如: my_sub_module u_inst (.clk(clk));
 * type = "my_sub_module"
 * name = "u_inst"
 */
export class HdlInstance {
    constructor(
        public type: string,  // 实例化的模块名 (模板)
        public name: string,  // 实例名
        public range: vscode.Range, // 代码中的位置
        public fileUri: vscode.Uri, // 所在文件
        public portConnections: string[] = [] // 记录实例化时连接的端口名
    ) {}
}

/**
 * 代表一个模块定义
 * 例如: module my_sub_module (input clk); ... endmodule
 */
export class HdlModule {
    public instances: HdlInstance[] = [];
    public ports: HdlPort[] = [];
    public params: HdlParam[] = [];
    public symbols: HdlSymbol[] = [];   // Phase 5: 模块内部所有信号符号
    public parent: string | null = null;
    
    constructor(
        public name: string,
        public fileUri: vscode.Uri,
        public range: vscode.Range,     // The full body range of the block
        public nameRange?: vscode.Range,// The range of just the identifier
        public type: HdlModuleType = HdlModuleType.Module
    ) {}

    public addInstance(inst: HdlInstance) {
        this.instances.push(inst);
    }

    public addPort(port: HdlPort) {
        this.ports.push(port);
    }

    public addParam(param: HdlParam) {
        this.params.push(param); 
    }
}