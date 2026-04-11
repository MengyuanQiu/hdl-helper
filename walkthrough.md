# HDL-Helper 全部修复完成 Walkthrough

## 修改概览

共修改 **9 个文件**，删除 **1 个文件**，修复 **11 个问题**。

---

## 变更文件列表

### 🔴 严重问题修复

| # | 文件 | 修复内容 |
|---|------|---------|
| P1 | [instantiateModule.ts](file:///e:/Project/Node_Prj/HDL-Helper/src/commands/instantiateModule.ts) | 重写：QuickPick 选择项目模块 + 直接插入光标位置 |
| P1 | [extension.ts](file:///e:/Project/Node_Prj/HDL-Helper/src/extension.ts) | 传入 `projectManager` 参数 |
| P2 | [completionProvider.ts](file:///e:/Project/Node_Prj/HDL-Helper/src/providers/completionProvider.ts) | 新增 [extractLiveSymbols](file:///e:/Project/Node_Prj/HDL-Helper/src/providers/completionProvider.ts#83-134) 实时解析文档文本 |
| P3 | [generateFsm.ts](file:///e:/Project/Node_Prj/HDL-Helper/src/commands/generateFsm.ts) | 添加 CSP meta 标签白名单 CDN |

### 🟡 中等问题修复

| # | 文件 | 修复内容 |
|---|------|---------|
| P4 | [package.json](file:///e:/Project/Node_Prj/HDL-Helper/package.json) | 新增 4 个快捷键：`Ctrl+Alt+F/A/M/R` |
| P5 | [codeGenerator.ts](file:///e:/Project/Node_Prj/HDL-Helper/src/utils/codeGenerator.ts) | 双正则分支：支持有/无注释的例化代码解析 |
| P5 | [autoDeclare.ts](file:///e:/Project/Node_Prj/HDL-Helper/src/commands/autoDeclare.ts) | 更新错误提示文案 |
| P6 | ~~definitionProvider.ts~~ | 已删除死代码文件 |

### 🟢 轻度问题修复

| # | 文件 | 修复内容 |
|---|------|---------|
| P8 | [renameProvider.ts](file:///e:/Project/Node_Prj/HDL-Helper/src/providers/renameProvider.ts) | 异步查找模块类型名位置，避免错误替换实例名 |
| P9 | [fastParser.ts](file:///e:/Project/Node_Prj/HDL-Helper/src/project/fastParser.ts) | 用 `endmodule` 关键字界定模块范围 |
| P10 | [codeActionProvider.ts](file:///e:/Project/Node_Prj/HDL-Helper/src/providers/codeActionProvider.ts) | 扫描范围 20→50 字符 |
| P11 | [package.json](file:///e:/Project/Node_Prj/HDL-Helper/package.json) | AXI/Memory/Registers 菜单添加 `when` 条件 |

---

## 新增快捷键一览

| 命令 | 快捷键 | 状态 |
|------|--------|------|
| Instantiate Module | `Ctrl+Alt+I` | 已有 |
| Create Signal Declarations | `Ctrl+Alt+W` | 已有 |
| Generate Testbench | `Ctrl+Alt+T` | 已有 |
| **Visualize FSM** | **`Ctrl+Alt+F`** | ✨新增 |
| **Generate AXI Interface** | **`Ctrl+Alt+A`** | ✨新增 |
| **Generate Memory IP** | **`Ctrl+Alt+M`** | ✨新增 |
| **Generate Register Map** | **`Ctrl+Alt+R`** | ✨新增 |

所有快捷键均支持用户通过 VS Code 的 `keybindings.json` 自定义覆盖。

---

## 构建验证

```
> npm run esbuild
  out\main.js      2.5mb
  out\main.js.map  3.8mb
Done in 121ms   ✅
```

> [!NOTE]
> `npm run compile`（tsc）报告的 5 个类型错误全部来自 `node_modules/vscode-jsonrpc/linkedMap.d.ts`，是 TypeScript 5.9 与旧版库的兼容性问题，与本次修改无关。esbuild 打包不受影响。

---

## 手动验证指南

按 `F5` 启动 Extension Development Host 后，依次测试：

1. **P1**: 在 .v/.sv 文件中按 `Ctrl+Alt+I` → 弹出模块列表 → 选择后代码插入光标位置
2. **P2**: 输入 `logic [7:0] my_var;` 后在下方输入 `my_` → 出现 `my_var` 补全
3. **P3**: 运行 `HDL: Visualize FSM` → WebView 正常渲染
4. **P4**: 按 `Ctrl+Alt+F` → 触发 FSM 命令
5. **P5**: 选中不带注释的例化代码，按 `Ctrl+Alt+W` → 生成信号声明
6. **P11**: 在非 Verilog 文件中右键 → 不应出现 AXI/Memory/Register 命令
