import * as vscode from 'vscode';

/**
 * 统一的 Linter 引擎接口 (Adapter Pattern)
 * 每个引擎只需要实现两个核心方法
 */
export interface ILinterEngine {
    /** 引擎名称，用于状态栏显示和日志 */
    readonly name: string;

    /**
     * 运行 Lint 检查，返回该引擎产生的所有诊断信息
     * @param doc 当前被检查的文档
     * @param config VS Code 配置对象
     * @param outputChannel 日志输出通道
     */
    check(
        doc: vscode.TextDocument,
        config: vscode.WorkspaceConfiguration,
        outputChannel: vscode.OutputChannel
    ): Promise<vscode.Diagnostic[]>;
}
