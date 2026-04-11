# HDL Helper Work Log (New)

## 2026-04-11 - Iteration 2 Day 1.5: Hierarchy Service Split

- 目标: 按 iteration_plan / execute_checklist 继续推进 Iteration 2，将层级语义从 TreeProvider 中抽离。
- 变更文件:
  - src/project/hierarchyService.ts
  - src/project/hdlTreeProvider.ts
  - src/extension.ts
  - log1.md
- 关键变更:
  - 新增 `HierarchyService`（最小版），提供 testbench 识别、Design Top 推断、Simulation Top 推断、根节点推断。
  - `hdlTreeProvider` 不再内置层级推断算法，改为委托给 `HierarchyService`。
  - extension 的 Top 兼容映射也复用 `HierarchyService` 的 testbench 判定逻辑。
- 验证:
  - npm run -s compile: 通过。
  - npm run -s lint: 通过。
  - npm -s test: 通过（3 passing）。
- 说明:
  - 从本条开始，后续开发日志优先更新到 `log1.md`。

## 2026-04-11 - Iteration 2 Day 2: Scoped Hierarchy Context

- 目标: 继续执行 Iteration 2，将 Design/Simulation 层级的递归解析从“全仓模块图”收敛到“角色范围模块集”。
- 变更文件:
  - src/project/hdlTreeProvider.ts
  - log1.md
- 关键变更:
  - 增加 Scoped 节点模型（ScopedModuleItem / ScopedInstanceItem），在双层级分支中保留 hierarchy kind 上下文。
  - 新增按角色推导的模块范围缓存：
    - Design: design + ip/generated
    - Simulation: design + simulation + verification + ip/generated
  - 双层级实例展开时仅解析范围内模块，范围外模块按叶子处理，避免跨域串入。
  - 当显式 Top 落在范围外时，双层级节点显示独立 warning，不影响其他 section。
- 验证:
  - npm run -s compile: 通过。
  - npm run -s lint: 通过。
  - npm -s test: 通过（3 passing）。

## 2026-04-11 - Iteration 2 Day 2.5: Minimal Dual-Hierarchy Regression Tests

- 目标: 补充最小双层级回归测试，覆盖 Design/Simulation 独立性与范围隔离。
- 变更文件:
  - src/test/extension.test.ts
  - log1.md
- 关键变更:
  - 新增测试 `Dual hierarchy keeps Design/Simulation tops independent`：
    - 验证修改 Simulation Top 不会影响 Design Top 的层级根节点。
  - 新增测试 `Dual hierarchy shows warning when top is out of scoped module set`：
    - 验证当 Design Top 落在范围外时，显示独立 warning，而不是错误展开。
  - 为测试添加最小 mock project manager 与 HDL module 构造辅助函数。
- 验证:
  - npm run -s compile: 通过。
  - npm run -s lint: 通过。
  - npm -s test: 通过（5 passing）。

## 2026-04-11 - Iteration 2 Day 3: DualHierarchy Root UI Behavior Tests

- 目标: 继续执行 Iteration 2，补充 dualHierarchy 开关对根节点结构影响的最小 UI 行为回归测试。
- 变更文件:
  - src/test/extension.test.ts
  - log1.md
- 关键变更:
  - 新增测试 `Root nodes exclude dual hierarchy branches when dualHierarchy is disabled`：
    - 验证 role-grouped 模式下，关闭 dualHierarchy 仅显示 `Sources + Module Hierarchy (Legacy)`。
  - 新增测试 `Root nodes include dual hierarchy branches when dualHierarchy is enabled`：
    - 验证开启 dualHierarchy 时显示 `Sources + Design Hierarchy + Simulation Hierarchy`。
  - 增加测试辅助函数 `getRootLabels`，统一提取根节点标签进行断言。
- 验证:
  - npm run -s compile: 通过。
  - npm run -s lint: 通过。
  - npm -s test: 通过（7 passing）。

## 2026-04-11 - Iteration 2 Day 3.5: Sources UI Readability Optimization

- 目标: 提升 Sources 区域文件节点可读性，降低“只看文件名/路径不直观”的使用成本。
- 变更文件:
  - src/project/hdlTreeProvider.ts
  - log1.md
- 关键变更:
  - Source group 计数描述从纯数字改为可读文本（如 `1 file` / `N files`）。
  - Source file 节点增加角色前缀标识：`[D]` / `[SIM]` / `[VER]` / `[CST]` / `[SCR]` / `[IP]` / `[U]`。
  - Source file 图标按角色区分（design/simulation/verification/...），不再统一 `file-code`。
  - Source file description 增加来源信息（project_config / heuristic 等）。
  - Source file tooltip 增强显示：Role、Source、In Active Target、完整路径。
- 验证:
  - npm run -s compile: 通过。
  - npm run -s lint: 通过。
  - npm -s test: 通过（7 passing）。

## 2026-04-11 - Iteration 2 Day 4: Command Behavior Regression Tests

- 目标: 继续执行 Iteration 2，补充命令行为回归测试（legacy top 映射与 clear 回退行为）。
- 变更文件:
  - src/project/topSelectionPolicy.ts
  - src/project/hdlTreeProvider.ts
  - src/extension.ts
  - src/test/extension.test.ts
  - log1.md
- 关键变更:
  - 新增 `topSelectionPolicy`，将 legacy `Set as Top Module` 的映射逻辑抽为可测试函数。
  - extension 的 `setTopModule` 命令改为调用统一映射策略。
  - treeProvider 新增 `clearScopedTops`，统一清理 design/simulation top 状态。
  - 新增回归测试：
    - `Legacy Set as Top mapping sends design-like module to Design Top`
    - `Legacy Set as Top mapping sends testbench-like module to Simulation Top`
    - `Clear scoped tops falls back to inferred design/simulation roots`
- 验证:
  - npm run -s compile: 通过。
  - npm run -s lint: 通过。
  - npm -s test: 通过（10 passing）。

## 2026-04-11 - Iteration 2 Day 4.5: Manual Script + Lightweight Debug Command

- 目标: 按建议继续执行，完成 dualHierarchy 最小手工验证脚本化，并补充轻量调试输出命令。
- 变更文件:
  - src/commands/debugDualHierarchyState.ts
  - src/extension.ts
  - package.json
  - resources/regression/DUAL_HIERARCHY_MANUAL_REGRESSION.md
  - log1.md
- 关键变更:
  - 新增命令 `HDL: Debug Dual Hierarchy State`：输出当前 flags、designTop/simulationTop、根节点快照和双层级首层节点信息。
  - 新命令接入：
    - Command Palette（commands）
    - Quick Actions 诊断项
    - Explorer 标题栏快捷入口
  - 新增手工回归脚本文档：`resources/regression/DUAL_HIERARCHY_MANUAL_REGRESSION.md`，覆盖根节点结构、top 独立性、legacy 映射、clear 回退、范围隔离。
- 验证:
  - npm run -s compile: 通过。
  - npm run -s lint: 通过。
  - npm -s test: 通过（10 passing）。

## 2026-04-11 - Iteration 2 Day 5: Diagnostics Discoverability Closure

- 目标: 按建议继续执行，补齐 dualHierarchy 诊断与回归清单入口的可发现性收口。
- 变更文件:
  - src/extension.ts
  - package.json
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 新增命令 `HDL: Open Dual Hierarchy Regression Checklist`，可直接打开 `resources/regression/DUAL_HIERARCHY_MANUAL_REGRESSION.md`。
  - 若回归清单文件缺失，命令自动回退执行 `HDL: Debug Dual Hierarchy State` 并给出 warning。
  - Quick Actions 新增 `Open Dual Hierarchy Regression Checklist` 入口。
  - 视图标题栏新增回归清单快捷入口。
  - 设置指南新增“Dual Hierarchy Diagnostics Entry”章节，并修复 Preset C/Preset D 的 Markdown 代码块闭合。
- 验证:
  - npm run -s compile: 通过。
  - npm run -s lint: 通过。
  - npm -s test: 通过（10 passing）。

## 2026-04-11 - Iteration 2 Day 5.5: Final Closure - Checklist Fallback Test

- 目标: 完成 Iteration 2 最后收口项，验证“回归清单命令在文件缺失时回退 debug 命令”的行为。
- 变更文件:
  - src/commands/openDualHierarchyRegressionChecklist.ts
  - src/extension.ts
  - src/test/extension.test.ts
  - log1.md
- 关键变更:
  - 将“打开回归清单并回退 debug”的流程抽为可测试 helper：
    - `getDualHierarchyChecklistPath`
    - `openDualHierarchyRegressionChecklist`
  - extension 命令改为调用 helper，实现行为与测试逻辑一致。
  - 新增最小回归测试：
    - `Dual hierarchy checklist helper opens checklist when file exists`
    - `Dual hierarchy checklist helper falls back to debug when file missing`
    - `Dual hierarchy checklist path helper returns undefined without workspace root`
- 验证:
  - npm run -s compile: 通过。
  - npm run -s lint: 通过。
  - npm -s test: 通过（13 passing）。

## 2026-04-11 - Iteration 2 Day 6: Source vs Hierarchy Context Menu Consistency

- 目标: 处理手工测试反馈，优化 Sources 与 Hierarchy 节点右键菜单的一致性与可理解性。
- 变更文件:
  - src/extension.ts
  - package.json
  - log1.md
- 关键变更:
  - 新增 source file 专用命令：
    - `HDL: Open Source File`
    - `HDL: Reveal Source File In Explorer`
  - Sources 文件节点右键菜单新增上述两项，避免“只有 Clear Top”这种不直观体验。
  - `HDL: Clear Top Module` 的右键显示范围收敛为 hierarchy 相关节点（module / hierarchy roots），不再污染 sources file 节点。
- 验证:
  - npm run -s compile: 通过。
  - npm run -s lint: 通过。
  - npm -s test: 通过（13 passing）。

## 2026-04-11 - Iteration 2 Day 6.5: Title Bar De-clutter + Settings Distinction

- 目标: 响应“顶部图标过多、两个设置缺乏区分度”的反馈，优化 HDL Explorer 顶栏可用性。
- 变更文件:
  - package.json
  - src/extension.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 顶栏从“多个设置/诊断图标并排”收敛为单一入口：`HDL: Open Hierarchy Tools`（tools 图标）。
  - `Hierarchy Tools` 菜单内明确区分：
    - Workbench Settings
    - Simulation Settings
    - Workbench Settings Guide
    - Dual Hierarchy Regression Checklist
    - Debug Dual Hierarchy State
    - Clear Top Module
  - 保留原命令本体（命令面板与 Quick Actions 仍可直接调用），仅优化顶栏信息密度与可理解性。
  - 设置指南新增 Toolbar Optimization 说明，明确新的入口策略。
- 验证:
  - npm run -s compile: 通过。
  - npm run -s lint: 通过。
  - npm -s test: 通过（13 passing）。

## 2026-04-11 - Iteration 2 Day 6.6: Hierarchy Tools Readability Polish

- 目标: 在保留顶栏降噪方案的前提下，再做一个小优化，提高 Hierarchy Tools 菜单可读性。
- 变更文件:
  - src/extension.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - `HDL: Open Hierarchy Tools` 的 QuickPick 项目改为分组前缀展示：
    - `[Settings] ...`
    - `[Diagnostics] ...`
    - `[Action] ...`
  - 调整菜单顺序与 placeholder，让用户更快识别“设置 vs 诊断 vs 操作”。
  - 设置指南补充分组前缀说明。
- 验证:
  - npm run -s compile: 通过。
  - npm run -s lint: 通过。
  - npm -s test: 通过（13 passing）。

## 2026-04-11 - Iteration 3 Day 1: Project Config Bootstrap Kickoff

- 目标: 按迭代计划启动 Iteration 3，落地 `project.json` 引导式初始化能力。
- 变更文件:
  - src/commands/createProjectConfig.ts
  - src/extension.ts
  - package.json
  - src/test/extension.test.ts
  - log1.md
- 关键变更:
  - 新增命令 `HDL: Create Project Config`，用于在工作区生成 `.hdl-helper/project.json` 最小模板并打开编辑。
  - 新增可测试 helper：
    - `inferDefaultTops(modules)`：从模块列表推断 design/simulation top（无 testbench 时对 simulation 做平滑回退）。
    - `buildProjectConfigTemplate(workspaceRoot, modules, workspaceName)`：构建包含 schemaVersion、name、top、files 等必需字段的最小配置。
  - 在 extension 中接入命令注册，并加入 Quick Actions 与 `HDL: Open Hierarchy Tools` 入口。
  - 在 `package.json` 增加命令贡献，确保 Command Palette 可发现。
  - 新增最小回归测试：
    - `Project config template builder creates required minimal schema fields`
    - `Project config top inference falls back gracefully when no testbench exists`
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（15 passing）。

## 2026-04-11 - Iteration 3 Day 2: Active Target Context Diagnostics

- 目标: 补齐 Iteration 3 的可观测性链路，新增 active target context 诊断输出并验证配置回退路径。
- 变更文件:
  - src/commands/debugActiveTargetContext.ts
  - src/extension.ts
  - package.json
  - src/test/extension.test.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 新增命令 `HDL: Debug Active Target Context`，输出以下关键信息：
    - projectConfig 开关与状态（not_enabled/missing/invalid/valid）
    - activeTarget 与 fallback target
    - 解析后的 `TargetContext` 快照
    - 关键问题列表（配置缺失/无效、activeTarget 无效、target 无 top 等）
  - 新增可测试 helper：
    - `buildTargetContextDebugSnapshot(...)`：统一构建诊断快照，便于命令与测试复用。
  - 命令接入入口：
    - Command Palette（命令贡献）
    - `HDL: Quick Actions` 诊断项
    - `HDL: Open Hierarchy Tools` 诊断项
  - 设置指南补充新诊断命令入口说明。
  - 新增最小回归测试：
    - `Active target context debug snapshot reports heuristic mode when project config is disabled`
    - `Active target context debug snapshot resolves config-driven active target`
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（17 passing）。

## 2026-04-11 - Iteration 3 Day 3: Config Issues Section in Explorer

- 目标: 继续推进 Iteration 3，将 project config 相关问题直接暴露到 Explorer 的 Diagnostics section。
- 变更文件:
  - src/project/configDiagnostics.ts
  - src/project/projectConfigService.ts
  - src/project/hdlTreeProvider.ts
  - src/test/extension.test.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 新增 `configDiagnostics` 纯函数模块：
    - `buildConfigIssues(...)` 统一汇总配置问题（missing/invalid/warnings/unresolved top）。
  - `ProjectConfigService` 增加 issue 缓存与读取接口：
    - `getIssues()` 返回上次 load 的 errors/warnings，供 UI 复用。
  - `HdlTreeProvider` 新增 `Diagnostics` 根节点（在 `projectConfig.enabled=true` 时显示）：
    - 按工作区输出 config 诊断项。
    - 缺失 `.hdl-helper/project.json` 时提供 `Create Project Config` 快捷动作。
    - 无问题时显示 clean 提示。
  - 新增最小回归测试：
    - `Config diagnostics builder reports missing project config in enabled mode`
    - `Config diagnostics builder reports unresolved top for simulation target`
  - 设置指南补充 `projectConfig.enabled` 与 Diagnostics section 的联动说明。
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（19 passing）。

## 2026-04-11 - Iteration 3 Day 4: Diagnostics Actionability and ActiveTarget Signals

- 目标: 继续迭代 Diagnostics 区域可操作性，补充 activeTarget 解析问题提示与一键配置入口。
- 变更文件:
  - src/commands/openProjectConfig.ts
  - src/extension.ts
  - src/project/hdlTreeProvider.ts
  - src/test/extension.test.ts
  - package.json
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 新增命令 `HDL: Open Project Config`：
    - 存在 `.hdl-helper/project.json` 时直接打开；
    - 缺失时自动触发模板创建流程（复用 `createProjectConfig`）。
  - Quick Actions 与 Hierarchy Tools 增加 `Open Project Config` 入口。
  - Explorer Diagnostics 项统一挂接 `Open Project Config` 命令，提升修复链路闭环效率。
  - Diagnostics 区新增 active target 相关问题提示：
    - activeTarget 无效导致回退
    - active target context 无法解析
    - active target 无解析 top
  - 新增最小回归测试：
    - `Open project config helper opens existing config file`
    - `Open project config helper creates template when config file is missing`
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（21 passing）。

## 2026-04-11 - Iteration 4 Day 1: Target-Keyed Run Record Groundwork

- 目标: 启动 Iteration 4（Target-driven Runs），先打通“仿真结果按 target 记录”最小闭环。
- 变更文件:
  - src/simulation/simManager.ts
  - src/commands/debugRecentRuns.ts
  - src/extension.ts
  - src/test/extension.test.ts
  - package.json
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - `SimManager.runTask` 改为返回结构化结果 `HdlSimRunResult`（success/task/top/buildDir/waveformPath/message）。
  - 在 `hdl-helper.targetDrivenRuns.enabled=true` 时：
    - `runSimulation` 执行后写入 `StateService.setLastRunForTarget(...)`。
    - target key 优先取 active `TargetContext.targetId`，否则回退 `heuristic:<top>`。
  - 新增诊断命令 `HDL: Debug Recent Runs By Target`，可输出当前 workspace 中按 target 存储的最近运行记录。
  - 命令接入：
    - Command Palette（命令贡献）
    - Quick Actions 诊断项
    - Hierarchy Tools 诊断项
  - 新增最小回归测试：
    - `Recent runs formatter returns fallback line for empty records`
    - `Recent runs formatter includes target and success fields`
  - 设置指南补充 target-driven run record 与调试命令说明。
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（23 passing）。

## 2026-04-11 - Iteration 4 Day 2: Reopen Waveform by Active Target

- 目标: 继续推进 Iteration 4，补齐“按 active target 重开最近波形”链路。
- 变更文件:
  - src/commands/openLastWaveformByTarget.ts
  - src/extension.ts
  - src/test/extension.test.ts
  - package.json
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 新增命令 `HDL: Open Last Waveform (Active Target)`：
    - projectConfig 模式下按 active `TargetContext.targetId` 查找最近运行记录；
    - heuristic 模式下回退 `heuristic:<simulationTop/designTop>` 键；
    - 命中后自动调用 `viewWaveform` 打开记录中的波形路径。
  - Quick Actions / Hierarchy Tools / Command Palette 全部接入该命令。
  - 新增 helper 与最小回归测试：
    - `pickRunRecordForTarget`
    - `Pick run record helper returns undefined when target id is missing`
    - `Pick run record helper returns matching target record`
  - 设置指南补充基于 active target 回开波形的使用说明。
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（25 passing）。
