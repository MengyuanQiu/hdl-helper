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

## 2026-04-11 - Iteration 4 Day 3: Reopen Run Log by Active Target

- 目标: 继续完善 target-driven 回看链路，支持按 active target 打开最近运行日志。
- 变更文件:
  - src/simulation/simManager.ts
  - src/commands/openLastLogByTarget.ts
  - src/commands/openLastWaveformByTarget.ts
  - src/extension.ts
  - src/test/extension.test.ts
  - package.json
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - `SimManager.runTask`/`runIverilog` 结果新增 `logPath`，并落盘 `build/<top>.run.log`。
  - `runSimulation` 写入 run record 时同步持久化 `logPath`。
  - 新增命令 `HDL: Open Last Log (Active Target)`：
    - 与波形命令一致按 active target/heuristic key 解析最近记录。
    - 命中后直接打开日志文件。
  - Quick Actions / Hierarchy Tools / Command Palette 接入新命令。
  - 新增最小回归测试：
    - `Get log path helper returns undefined for missing record`
    - `Get log path helper returns log path from run record`
  - 设置指南补充按 active target 打开最近日志的说明。
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（27 passing）。

## 2026-04-11 - Iteration 4 Day 4: Recent Runs Interactive Picker

- 目标: 继续推进 Iteration 4，提供可交互的 Recent Runs 入口，支持从历史记录直接打开波形/日志。
- 变更文件:
  - src/commands/openRecentRuns.ts
  - src/extension.ts
  - src/test/extension.test.ts
  - package.json
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 新增命令 `HDL: Open Recent Runs`：
    - 按时间倒序列出 target-keyed run records；
    - 支持二次动作选择（Open Waveform / Open Log）；
    - 自动校验文件存在性并给出缺失提示。
  - 命令接入：
    - Command Palette
    - `HDL: Quick Actions`
    - `HDL: Open Hierarchy Tools`
  - 新增 helper 与最小回归测试：
    - `getRecentRunEntries`（按 timestamp 降序）
    - `getRecentRunActions`（根据记录可用路径输出可执行动作）
    - `Recent runs entries helper sorts by timestamp descending`
    - `Recent runs actions helper returns waveform and log actions when paths exist`
  - 设置指南补充 Recent Runs 交互命令说明。
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（29 passing）。

## 2026-04-11 - Iteration 4 Day 5: Active Target Prioritization in Recent Runs

- 目标: 进一步提升 Recent Runs 可用性，减少在多 target 记录中手工查找成本。
- 变更文件:
  - src/commands/openRecentRuns.ts
  - src/test/extension.test.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - `openRecentRuns` 增强 active target 识别：
    - projectConfig 模式优先使用 active `TargetContext.targetId`；
    - heuristic 模式回退 `heuristic:<simulationTop/designTop>` 键。
  - 新增 helper `prioritizeActiveTarget`，将 active target 记录置顶。
  - Recent Runs 列表中 active 记录增加 `[ACTIVE]` 标记。
  - 新增最小回归测试：
    - `Recent runs helper prioritizes active target at top`
  - 设置指南补充“Recent Runs 会优先显示 active target 记录”说明。
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（30 passing）。

## 2026-04-11 - Iteration 4 Day 6: One-click Open Last Run Artifacts

- 目标: 继续推进 Iteration 4，提供 active target 语境下一键回看运行产物（波形/日志）的统一入口。
- 变更文件:
  - src/commands/openLastRunArtifactsByTarget.ts
  - src/extension.ts
  - src/test/extension.test.ts
  - package.json
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 新增命令 `HDL: Open Last Run Artifacts (Active Target)`：
    - 解析 active target 对应最近运行记录；
    - 自动识别可用产物（Open Waveform / Open Log）；
    - 多产物时弹出动作选择；
    - 无可用产物时输出明确缺失原因（record 缺失、路径缺失、文件不存在）。
  - 新增可测试 helper：
    - `getAvailableArtifactActions`
    - `getMissingArtifactReasons`
  - 新命令接入：
    - Command Palette
    - `HDL: Quick Actions`
    - `HDL: Open Hierarchy Tools`
  - 新增最小回归测试：
    - `Artifact action helper returns both actions when files are available`
    - `Artifact missing helper reports missing record context`
    - `Artifact missing helper reports missing waveform and log files`
  - 设置指南补充一键回看最近产物命令说明。
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（33 passing）。

## 2026-04-11 - Iteration 4 Day 7: Tasks and Runs Explorer Section

- 目标: 推进 Iteration 4 的可见性收口，在 Explorer 中落地 `Tasks and Runs` 分组并支持记录项直接打开产物。
- 变更文件:
  - src/project/hdlTreeProvider.ts
  - src/commands/openRunRecordArtifacts.ts
  - src/extension.ts
  - src/test/extension.test.ts
  - package.json
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - Explorer 新增 `Tasks and Runs` 根节点（`targetDrivenRuns.enabled=true` 时显示）。
  - 节点子项按 run timestamp 倒序展示 target-keyed 运行记录。
  - 新增命令 `HDL: Open Run Record Artifacts`：
    - 支持从指定 target 记录直接打开 waveform/log（单一动作自动执行，多动作可选）。
  - `RunRecordItem` 点击行为绑定到上述命令，实现“树内直接回看”。
  - `HdlTreeProvider` 增加 run record provider 注入，避免在 provider 中直接持有状态服务。
  - 新增最小回归测试：
    - `Run record picker returns undefined for unknown target`
    - `Run record picker returns record for existing target`
  - 设置指南补充 `Tasks and Runs` 分组与记录项点击行为说明。
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（35 passing）。

## 2026-04-11 - Iteration 4 Day 8: Rerun Active Target and Run Record

- 目标: 继续推进 Iteration 4，补齐最近运行记录的重跑能力（active target 重跑 + 指定记录重跑）。
- 变更文件:
  - src/project/types.ts
  - src/commands/debugRecentRuns.ts
  - src/commands/rerunTargetRun.ts
  - src/extension.ts
  - src/test/extension.test.ts
  - package.json
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - `RunRecord` 新增 `top?: string`，`runSimulation` 写入 run record 时同步记录执行 top。
  - `HDL: Debug Recent Runs By Target` 输出新增 `Top` 字段，便于定位重跑输入。
  - 新增命令 `HDL: Rerun Active Target`：
    - 默认解析 active target 对应的 run record 并重跑；
    - 支持从 `Tasks and Runs` 记录项右键传入目标，实现“按指定记录重跑”。
  - 新增 helper：
    - `resolveRerunTop`（优先 record.top，回退解析 `Simulate <top>` taskName）
    - `resolveTargetIdFromRerunArg`（兼容 string/object 命令参数）
  - 入口接入：
    - Command Palette
    - `HDL: Quick Actions`
    - `HDL: Open Hierarchy Tools`
    - `Tasks and Runs` 记录项右键菜单（`viewItem == run-record`）
  - 新增最小回归测试：
    - `Rerun top resolver prefers explicit top field`
    - `Rerun top resolver falls back to simulate task name`
    - `Rerun top resolver returns undefined when no top info exists`
    - `Rerun target arg resolver supports string and object arg`
  - 同步增强 existing test：`Recent runs formatter includes target and success fields` 增加 Top 字段断言。
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（39 passing）。

## 2026-04-11 - Iteration 4 Day 9: Run Failure Type Classification

- 目标: 继续推进 Iteration 4 收口项，补齐“失败类型可区分”的运行可观测性。
- 变更文件:
  - src/project/types.ts
  - src/simulation/simManager.ts
  - src/extension.ts
  - src/commands/debugRecentRuns.ts
  - src/commands/openRecentRuns.ts
  - src/project/hdlTreeProvider.ts
  - src/test/extension.test.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 新增统一失败类型 `RunFailureType`：`precheck` / `compile` / `runtime` / `unsupported`。
  - `SimManager.runTask/runIverilog` 按阶段打标失败类型：
    - 前置检查失败（workspace/tool/top/source）-> `precheck`
    - 编译失败 -> `compile`
    - 运行失败 -> `runtime`
    - 不支持仿真器 -> `unsupported`
  - `runSimulation` 写入 run record 时同步保存 `failureType`。
  - 可视化贯通：
    - `Debug Recent Runs By Target` 输出 `FailureType`
    - `Open Recent Runs` 失败记录显示 `failed(<type>)`
    - Explorer `Tasks and Runs` 失败记录显示 `failed(<type>)`
  - 新增最小回归测试：
    - `Recent runs formatter includes failure type for failed records`
    - `Recent runs picker description includes failure type when failed`
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（41 passing）。

## 2026-04-12 - Iteration 4 Day 10: Tasks and Runs Section Expansion

- 目标: 继续推进 Iteration 4，补齐 `Tasks and Runs` 的信息架构与操作闭环（Simulation Tasks / Recent Runs / Last Waveform / Last Logs）。
- 变更文件:
  - src/project/hdlTreeProvider.ts
  - src/extension.ts
  - src/test/extension.test.ts
  - package.json
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - `Tasks and Runs` 根节点改为四个子分组：
    - `Simulation Tasks`：展示 `hdl_tasks.json` 任务摘要（name/top/tool）
    - `Recent Runs`：保留按时间倒序 target run records
    - `Last Waveform`：展示可直接打开的最近波形记录
    - `Last Logs`：展示可直接打开的最近日志记录
  - 新增命令 `HDL: Run Simulation Task Item`，支持从 `Simulation Tasks` 节点直接触发仿真。
  - 新增 helper：
    - `getLatestWaveformEntries`
    - `getLatestLogEntries`
    用于从 run records 过滤存在文件并按时间排序。
  - explorer 刷新增强：
    - 监听 `RunRecorded` 事件自动刷新 `Tasks and Runs`
    - `targetDrivenRuns.enabled` / `simulation.tasksFile` 配置变化触发刷新
  - 菜单接入：`simulation-task` 节点右键增加 `Run Simulation Task Item`。
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（43 passing）。

## 2026-04-12 - Iteration 4 Day 11: Simulation Tasks File Onboarding

- 目标: 继续完善 Iteration 4 任务可操作性，补齐 `Simulation Tasks` 空状态的一键可达配置路径。
- 变更文件:
  - src/commands/openSimulationTasksFile.ts
  - src/extension.ts
  - src/project/hdlTreeProvider.ts
  - src/test/extension.test.ts
  - package.json
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 新增命令 `HDL: Open Simulation Tasks File`：
    - 打开当前配置的 `simulation.tasksFile`
    - 文件缺失时自动创建模板并打开
  - 新增 helper：
    - `getSimulationTasksFilePath`
    - `buildSimulationTasksTemplate`
    - `openSimulationTasksFile`
  - 入口接入：
    - Command Palette
    - `HDL: Quick Actions`
    - `HDL: Open Hierarchy Tools`
    - `Tasks and Runs` 的 `Simulation Tasks` 分组与根节点右键菜单
  - 空状态优化：
    - `Simulation Tasks` 无任务时提示项支持直接点击进入任务文件创建/编辑
  - 新增最小回归测试：
    - `Simulation tasks file path resolver handles relative and absolute paths`
    - `Open simulation tasks helper opens existing file`
    - `Open simulation tasks helper creates template when missing`
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（46 passing）。

## 2026-04-12 - Iteration 4 Day 12: Run Active Target Simulation

- 目标: 继续推进 Iteration 4，让运行入口真正以 active target context 为中心。
- 变更文件:
  - src/commands/runActiveTargetSimulation.ts
  - src/extension.ts
  - src/test/extension.test.ts
  - package.json
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 新增命令 `HDL: Run Active Target Simulation`：
    - projectConfig 模式优先解析 active target 的 `top`
    - 当 active target 无法解析 top 时，回退到 heuristic（simulationTop/designTop）并给出可见 warning
    - 复用 `hdl-helper.runSimulation` 执行链路，保持 run record 写入与后续回看一致
  - 新增 helper：
    - `resolveFallbackSimulationTop`
    - `buildConfigFallbackWarning`
  - 入口接入：
    - Command Palette
    - `HDL: Quick Actions`
    - `HDL: Open Hierarchy Tools`
    - `Tasks and Runs` 根节点 / `Recent Runs` 分组右键菜单
  - 新增最小回归测试：
    - `Active target simulation fallback top prefers simulation top`
    - `Active target simulation fallback warning includes target id when available`
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（48 passing）。

## 2026-04-12 - Iteration 4 Day 13: Active Target Highlighting in Tasks and Runs

- 目标: 继续推进 Iteration 4 的 active-target 语义一致性，在 Explorer 的 `Tasks and Runs` 中补齐 active record 的可见性与优先级。
- 变更文件:
  - src/commands/openRecentRuns.ts
  - src/project/hdlTreeProvider.ts
  - src/extension.ts
  - src/test/extension.test.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - `openRecentRuns` 导出 `resolveActiveTargetIdForRuns`，统一 active target 解析逻辑供其他入口复用。
  - `HdlTreeProvider` 新增通用 helper：
    - `prioritizeTargetEntries`（按 active target 置顶）
  - `Tasks and Runs` 三个分组增强：
    - `Recent Runs`
    - `Last Waveform`
    - `Last Logs`
    均按 active target 置顶并在条目标签前标记 `[ACTIVE]`。
  - extension 在初始化 TreeProvider 时注入 active target resolver 回调，实现 explorer 侧与命令侧一致的 target 选择策略。
  - 新增最小回归测试：
    - `Target entry prioritizer moves active target to top`
    - `Target entry prioritizer keeps order when active target is missing`
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（50 passing）。

## 2026-04-12 - Iteration 4 Day 14: Context-driven Active Target Run

- 目标: 继续推进 Iteration 4，补齐“按 active target context 驱动运行”的执行闭环。
- 变更文件:
  - src/commands/runActiveTargetSimulation.ts
  - src/extension.ts
  - src/test/extension.test.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - `HDL: Run Active Target Simulation` 升级为 context-driven 执行：
    - projectConfig 模式下从 active target context 生成 ad-hoc 仿真任务并直接执行
    - 若 context 提供 `filelist`，优先作为仿真边界输入
  - 运行记录写回增强：
    - 直接写入 target-driven run record（success/failureType/log/waveform）
    - 当 active target 退化为 heuristic fallback 时，统一记录到 `heuristic:<top>` 键，保证后续回看命令一致命中
  - 新增 helper：
    - `buildContextDrivenSimTask`
    - `resolveRunTargetId`
  - 新增最小回归测试：
    - `Active target simulation builds context-driven task with filelist`
    - `Active target run target id resolver uses heuristic top fallback`
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（52 passing）。

## 2026-04-12 - Iteration 4 Day 15: RunsService Consolidation

- 目标: 继续收口 Iteration 4，抽离独立 `RunsService`，统一 active target 解析与 run record 写回逻辑。
- 变更文件:
  - src/simulation/runsService.ts
  - src/commands/openRecentRuns.ts
  - src/commands/openLastWaveformByTarget.ts
  - src/commands/openLastLogByTarget.ts
  - src/commands/openLastRunArtifactsByTarget.ts
  - src/commands/rerunTargetRun.ts
  - src/commands/runActiveTargetSimulation.ts
  - src/extension.ts
  - src/test/extension.test.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 新增 `RunsService`：
    - `resolveActiveTargetIdFromRuns`
    - `resolveActiveRunRecord`
    - `resolveHeuristicRunTargetId`
    - `writeRunRecordForTarget`
  - 五个命令改为复用统一 resolver：
    - `Open Last Waveform (Active Target)`
    - `Open Last Log (Active Target)`
    - `Open Last Run Artifacts (Active Target)`
    - `Open Recent Runs`
    - `Rerun Active Target`
  - 运行记录写回统一改用 `writeRunRecordForTarget`：
    - `runSimulation`
    - `runActiveTargetSimulation`
  - 结果：run-related 命令的 active target 选择与回看行为保持一致，减少重复分支代码。
  - 新增最小回归测试：
    - `Runs service resolves heuristic run target id by simulation then design top`
    - `Runs service write helper forwards record to state service`
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（54 passing）。

## 2026-04-12 - Iteration 4 Day 16: TargetContext Resolved Files

- 目标: 继续收口 Iteration 4，补齐 `TargetContextService.resolveFiles` 的可用实现，避免 context 中 `resolvedFiles` 长期为空。
- 变更文件:
  - src/project/targetContextService.ts
  - src/test/extension.test.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - `TargetContextService` 实现 source-set 文件解析：
    - 按 target.sourceSets 聚合 source set includes/excludes
    - 基于工作区递归扫描 + glob 匹配生成 deterministic `resolvedFiles`
    - 加入服务内缓存（workspace files / source-set files）以降低重复计算成本
  - glob 匹配增强：支持 `**/` 的零或多级目录匹配语义。
  - 新增最小回归测试：
    - `Target context service resolves files from source sets with include and exclude patterns`
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（55 passing）。

## 2026-04-12 - Iteration 4 Day 17: SimManager TargetContext Entry

- 目标: 继续收口 Iteration 4，将 active target 的 context-driven 执行入口下沉到 `SimManager`，减少命令层组装逻辑。
- 变更文件:
  - src/simulation/simManager.ts
  - src/commands/runActiveTargetSimulation.ts
  - src/test/extension.test.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - `SimManager` 新增 target-context 入口：
    - `buildTaskFromTargetContext(activeContext)`
    - `runTargetContext(activeContext, projectManager, workspaceUri)`
  - `HdlSimTask` 扩展上下文字段：
    - `includeDirs`
    - `defines`
  - `runTask` 编译参数增强：
    - 合并 task-level `includeDirs`
    - 将 `defines` 透传为 `iverilog` 的 `-D...` 参数
  - `runActiveTargetSimulation` 改为调用 `SimManager.runTargetContext(...)`，命令层仅保留 target 解析与回退策略。
  - 更新回归测试，确保 context-driven task 可携带 `resolvedFiles/includeDirs/defines/filelist`。
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（55 passing）。

## 2026-04-12 - Iteration 5 Day 18: SourceSetService Foundation

- 目标: 进入 Iteration 5，落地 first-class SourceSet 解析服务，并让 TargetContext 复用统一解析入口。
- 变更文件:
  - src/project/sourceSetService.ts
  - src/project/targetContextService.ts
  - src/test/extension.test.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 新增 `SourceSetService`：
    - `resolveSourceSetFiles(setName)`
    - `resolveFilesForSourceSets(sourceSetNames)`
    - `updateProjectConfig(...)` 与缓存刷新
  - `TargetContextService.resolveFiles` 改为委托 `SourceSetService`，移除重复的文件扫描与 glob 解析实现。
  - 新增最小回归测试：
    - `Source set service resolves deterministic union with shared files`
    - `Source set service refreshes cache after config update`
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（57 passing）。

## 2026-04-12 - Iteration 5 Day 19: Shared File Role Semantics Alignment

- 目标: 继续推进 Iteration 5，将 `SourceSetService` 与 `ClassificationService` 对齐，落实 shared file 的 primary/secondary role 语义链路。
- 变更文件:
  - src/project/sourceSetService.ts
  - src/project/classificationService.ts
  - src/project/hdlTreeProvider.ts
  - src/test/extension.test.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - `SourceSetService` 新增 per-file 语义接口：
    - `getMatchedSourceSetsForFile(filePath)`
    - `getRoleSnapshotForFile(filePath)`
  - `ClassificationService` 的 config-driven 分支改为调用 `SourceSetService` 统一匹配逻辑，避免 source-set 规则重复实现。
  - shared file 分类结果中保留 deterministic `rolePrimary + roleSecondary + referencedBySourceSets`。
  - Sources tooltip 增强显示 secondary roles 与 source set 列表，便于定位 shared-file 语义来源。
  - 新增最小回归测试：
    - `Classification config mode reports primary and secondary roles for shared source-set file`
    - `Source set service exposes primary and secondary roles for shared file`
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（59 passing）。

## 2026-04-12 - Iteration 5 Day 20: Source Observability Metadata

- 目标: 继续推进 Iteration 5，在 Explorer 与分类调试输出中补齐 shared-file / source-set 的可观测性元数据。
- 变更文件:
  - src/project/hdlTreeProvider.ts
  - src/commands/debugProjectClassification.ts
  - src/test/extension.test.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - Sources 分组描述升级：显示 `files | shared | active`，提升 shared-file 与 active-target 覆盖可见性。
  - `debugProjectClassification` 新增聚合统计 helper：
    - shared file 数
    - active target 覆盖文件数
    - 每个 source set 的文件覆盖数
  - 新增最小回归测试：
    - `Source group description includes shared and active metadata`
    - `Classification observability stats includes shared, active and source-set coverage`
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（61 passing）。

## 2026-04-12 - Iteration 5 Day 21: Reusable Classification Debug Template

- 目标: 继续推进 Iteration 5，把分类调试输出收敛为可复用模板，便于后续 Inspector 复用同一输出模型。
- 变更文件:
  - src/commands/debugProjectClassification.ts
  - src/test/extension.test.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 新增 `formatClassificationDebugReport(...)`，统一渲染 workspace 配置摘要、分类统计、source-set 覆盖、详细文件条目。
  - `debugProjectClassification` 改为构建输入并调用 formatter，命令层只负责采集数据与输出。
  - `buildClassificationObservabilityStats` 增强：同一文件内重复 source-set 名称按去重计数。
  - 新增最小回归测试：
    - `Classification observability stats deduplicates repeated source-set names per file`
    - `Classification debug report formatter renders deterministic sections`
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（63 passing）。

## 2026-04-12 - Iteration 5 Day 22: Shared Debug Report Types

- 目标: 继续推进 Iteration 5，将分类调试模板输入结构提升到共享领域类型，减少 command-local 类型重复。
- 变更文件:
  - src/project/types.ts
  - src/commands/debugProjectClassification.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 在 `project/types.ts` 新增共享类型：
    - `ClassificationDebugConfigSnapshot`
    - `ClassificationObservabilityStats`
    - `ClassificationDebugReportInput`
  - `debugProjectClassification` 移除本地重复接口定义，改为直接复用共享类型。
  - 结果：分类调试模板输入结构可被后续 Inspector/详情视图直接复用，降低类型漂移风险。
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（63 passing）。

## 2026-04-12 - Iteration 5 Day 23: Section Model and Renderer Split

- 目标: 继续推进 Iteration 5，将分类调试输出从单一文本 formatter 拆分为 section model + renderer，为 Inspector 结构化复用铺路。
- 变更文件:
  - src/commands/debugProjectClassification.ts
  - src/test/extension.test.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 新增结构化构建函数：`buildClassificationDebugSections(...)`。
  - 新增渲染函数：`renderClassificationDebugSections(...)`。
  - `formatClassificationDebugReport(...)` 改为组合上述两步，保持已有文本输出契约。
  - 新增最小回归测试：
    - `Classification debug section builder returns expected section titles`
    - `Classification debug section renderer emits headers and trailing separator`
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（65 passing）。

## 2026-04-12 - Iteration 5 Day 24: Stable Section Metadata

- 目标: 继续推进 Iteration 5，在 classification section model 中加入稳定标识，提升 Inspector 对结构化区块的消费能力。
- 变更文件:
  - src/project/types.ts
  - src/commands/debugProjectClassification.ts
  - src/test/extension.test.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - `ClassificationDebugSection` 增加稳定元数据：
    - `id`
    - `type`（workspace/config/discovery/summary/source-set-coverage/details）
  - `buildClassificationDebugSections(...)` 为每个 section 产出固定 id/type。
  - 测试增强：
    - 断言 builder 返回 section id/type 序列稳定
    - renderer fixture 补齐 id/type 字段
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（65 passing）。

## 2026-04-12 - Iteration 5 Day 25: Section Priority and Filter Strategy

- 目标: 继续推进 Iteration 5，为 classification section model 增加统一优先级和过滤策略，支持 Inspector 侧 overview/details 视图切片。
- 变更文件:
  - src/project/types.ts
  - src/commands/debugProjectClassification.ts
  - src/test/extension.test.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - `project/types.ts` 新增渲染过滤类型：
    - `ClassificationDebugSectionFilterPreset`
    - `ClassificationDebugSectionRenderOptions`
  - `debugProjectClassification` 新增策略函数：
    - `getClassificationDebugSectionPriority(...)`
    - `getClassificationDebugSectionTypesByPreset(...)`
    - `filterClassificationDebugSections(...)`
  - `renderClassificationDebugSections(...)` 支持可选过滤参数，默认按优先级稳定排序输出。
  - 新增最小回归测试：
    - section 优先级关系
    - preset 类型选择
    - preset + include 策略下的稳定过滤排序
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（68 passing）。

## 2026-04-12 - Iteration 5 Day 26: Preset Debug Command Entry

- 目标: 按建议继续执行，将 section 过滤策略接入可交互命令入口，形成 overview/details 的真实使用闭环。
- 变更文件:
  - src/commands/debugProjectClassification.ts
  - src/extension.ts
  - src/test/extension.test.ts
  - package.json
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 新增命令 `HDL: Debug Project Classification (View...)`（`hdl-helper.debugProjectClassificationView`）。
  - 新命令通过 QuickPick 选择 preset：
    - `all`
    - `overview`
    - `details`
  - `debugProjectClassification` 支持渲染选项输入；新增 helper `buildClassificationRenderOptionsByPreset(...)`。
  - Quick Actions 与 Hierarchy Tools 均新增该入口，形成统一可达性。
  - 新增最小回归测试：
    - preset helper 输出映射
    - overview preset 下 formatter 过滤行为
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（70 passing）。

## 2026-04-12 - Iteration 5 Day 27: Preset Argument Invocation

- 目标: 按建议继续推进，让 `Debug Project Classification (View...)` 支持参数调用，方便按钮与自动化复用。
- 变更文件:
  - src/commands/debugProjectClassification.ts
  - src/extension.ts
  - src/test/extension.test.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 新增 `resolveClassificationDebugPresetArg(...)`，支持字符串与对象参数解析（`preset/view/mode`）。
  - `hdl-helper.debugProjectClassificationView` 命令更新：
    - 入参可解析时直接按 preset 执行
    - 无有效入参时保持 QuickPick 回退
  - 复用 `buildClassificationRenderOptionsByPreset(...)`，保证 preset 到 render options 的单一映射。
  - 新增最小回归测试：
    - `Classification preset arg resolver supports string and object payloads`
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（71 passing）。

## 2026-04-12 - Iteration 5 Day 28: Preset Alias Commands

- 目标: 继续推进 Iteration 5，提供 overview/details 轻量命令别名，降低 preset 调用门槛。
- 变更文件:
  - src/extension.ts
  - package.json
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 新增别名命令：
    - `hdl-helper.debugProjectClassificationOverview`
    - `hdl-helper.debugProjectClassificationDetails`
  - 别名命令行为：
    - overview 别名直接调用 `debugProjectClassificationView` 并传入 `overview`
    - details 别名直接调用 `debugProjectClassificationView` 并传入 `details`
  - Quick Actions 与 Hierarchy Tools 新增两个诊断入口，支持一键直达。
  - Command Palette 命令贡献新增 Overview/Details 两个可发现入口。
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（71 passing）。

## 2026-04-12 - Iteration 5 Day 29: Title Bar and Diagnostics Fast Paths

- 目标: 按建议继续推进，把 overview/details 别名命令接入更短操作路径（title bar 与 diagnostics 节点快捷入口）。
- 变更文件:
  - package.json
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - `view/title` 新增 HDL Explorer 顶栏入口：
    - `debugProjectClassificationOverview`
    - `debugProjectClassificationDetails`
  - `view/item/context` 新增 Diagnostics root 右键入口：
    - `debugProjectClassificationOverview`
    - `debugProjectClassificationDetails`
  - 结果：分类调试 overview/details 降低为“单击直达”，无需先开 QuickPick。
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（71 passing）。

## 2026-04-12 - Iteration 5 Day 30: All Preset Alias and Tri-Mode Fast Paths

- 目标: 继续推进分类调试可达性，把 all preset 也做成与 overview/details 一致的别名命令与快捷入口。
- 变更文件:
  - src/extension.ts
  - package.json
  - src/test/extension.test.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 新增别名命令：
    - `hdl-helper.debugProjectClassificationAll`
  - 新增命令行为：
    - All 别名直接调用 `debugProjectClassificationView` 并传入 `all`
  - Quick Actions 与 Hierarchy Tools 新增 `Debug Project Classification (All)`。
  - `view/title` 与 Diagnostics root 右键菜单新增 All 快捷入口，形成 `All/Overview/Details` 三态直达。
  - 回归补充：preset 参数解析新增空白与大小写容错断言（`' ALL '` -> `all`）。
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（71 passing）。

## 2026-04-12 - Iteration 5 Day 31: Interactive Classification Inspector Entry

- 目标: 按 Iteration 5.5 inspector 方向继续推进，增加可交互的单文件分类检查入口，不涉及外部仿真后端专项。
- 变更文件:
  - src/commands/debugProjectClassification.ts
  - src/extension.ts
  - package.json
  - src/test/extension.test.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 新增命令：
    - `hdl-helper.inspectProjectClassification`
  - 新增 inspector 流程：
    - 选择 workspace（多工作区时）
    - 选择分类结果中的文件（QuickPick）
    - 输出该文件完整分类元数据（primary/secondary role、sourceOfTruth、active-target、sourceSet/target 引用）
    - 可选直接打开该文件
  - `debugProjectClassification.ts` 新增可复用 helper：
    - `buildClassificationInspectorQuickPickItem`
    - `buildClassificationInspectorDetailLines`
    - 共用 `buildClassificationDebugReportInput` 以复用分类采集链路
  - 快捷入口接线：
    - Quick Actions
    - Hierarchy Tools
    - Command Palette
    - HDL Explorer title bar
    - Diagnostics root 右键菜单
  - 回归补充：
    - inspector quick-pick/详情行 helper 测试
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（72 passing）。

## 2026-04-12 - Iteration 5 Day 32: Inspector Scope Presets and Filtered Entry Paths

- 目标: 继续推进 Iteration 5.5 inspector 能力，为分类检查增加 scope 预设与快速筛选入口，不涉及外部仿真后端专项。
- 变更文件:
  - src/commands/debugProjectClassification.ts
  - src/extension.ts
  - src/test/extension.test.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - `inspectProjectClassification` 支持 scope 参数与交互式 scope 选择。
  - 新增 scope 预设：
    - `all`
    - `active`
    - `shared`
    - `project-config`
    - `heuristic`
  - 新增可复用 helper：
    - `resolveClassificationInspectorScopeArg`
    - `filterClassificationInspectorResults`
  - Quick Actions 增加两条快速入口：
    - `Inspect Project Classification (Active Files)`
    - `Inspect Project Classification (Shared Files)`
  - Hierarchy Tools 增加对应诊断入口，并支持命令参数透传（`executeCommand(command, args)`）。
  - Inspector 输出新增 `Inspector Scope` 头信息，便于记录当前筛选上下文。
  - 回归补充：
    - scope 参数解析测试
    - scope 过滤行为测试
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（74 passing）。

## 2026-04-12 - Iteration 5 Day 33: Inspector Summary Aggregation View

- 目标: 继续推进 Iteration 5.5 inspector，新增聚合摘要视图，支持按 scope 输出 sourceOfTruth/role/source-set 覆盖统计。
- 变更文件:
  - src/commands/debugProjectClassification.ts
  - src/extension.ts
  - package.json
  - src/test/extension.test.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 新增命令：
    - `hdl-helper.inspectProjectClassificationSummary`
  - 新增聚合 helper：
    - `buildClassificationInspectorSummaryLines`
  - 新增 scope 选择复用逻辑：
    - inspector 详情与 summary 共用 scope 解析/选择流程
  - summary 输出信息包含：
    - matched files / active files / shared files
    - sourceOfTruth breakdown
    - primary role breakdown
    - source-set coverage（按匹配结果）
  - 快速入口接线：
    - Quick Actions
    - Hierarchy Tools
    - Command Palette
    - HDL Explorer title bar
    - Diagnostics root 右键菜单
  - 回归补充：
    - inspector summary 聚合输出测试
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（75 passing）。

## 2026-04-12 - Iteration 5 Day 34: Inspector Summary Top Files Preview

- 目标: 继续推进 Iteration 5.5 inspector，在 summary 结果中增加可直接用于排查的代表性文件预览，强化“聚合到定位”的闭环。
- 变更文件:
  - src/commands/debugProjectClassification.ts
  - src/test/extension.test.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 新增 helper：
    - `buildClassificationInspectorTopFilePreviewLines`
  - `buildClassificationInspectorSummaryLines` 新增 `Top Files Preview` 区块：
    - 按 deterministic priority 排序（active > shared > sourceOfTruth 优先级 > 路径）
    - 输出 marker：
      - `[A-]` 表示 active target file
      - `[-S]` 表示 shared file
      - `[AS]` 表示同时 active+shared
  - 支持 summary options 传入 `topFileLimit` 控制预览数量（默认 8）。
  - 回归补充：
    - summary 含 top-file 区块断言
    - top-file 排序稳定性断言
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（76 passing）。

## 2026-04-12 - Iteration 5 Day 35: Summary Drill-down to Top Files

- 目标: 继续推进 Iteration 5.5 inspector，把 summary 聚合结果升级为可直接下钻的排查入口。
- 变更文件:
  - src/commands/debugProjectClassification.ts
  - src/test/extension.test.ts
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 新增结构化 helper：
    - `buildClassificationInspectorTopFilePreviewEntries`
  - `buildClassificationInspectorTopFilePreviewLines` 复用结构化 entries 输出，避免排序/截断逻辑重复。
  - `inspectProjectClassificationSummary` 新增交互：
    -  summary 输出后可选 `Open Top File`
    -  从 top-file preview 快速选择并直接打开文件
  - 回归补充：
    - top-file entries 排序与 limit 行为测试
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（77 passing）。

## 2026-04-12 - Iteration 5 Day 36: Summary Scope Alias Commands and Fast Paths

- 目标: 继续推进 Iteration 5.5 inspector 可达性，为 summary 新增 active/shared 别名命令，减少 scope 选择步骤。
- 变更文件:
  - src/extension.ts
  - package.json
  - docs/WORKBENCH_SETTINGS_GUIDE.md
  - log1.md
- 关键变更:
  - 新增别名命令：
    - `hdl-helper.inspectProjectClassificationSummaryActive`
    - `hdl-helper.inspectProjectClassificationSummaryShared`
  - 命令行为：
    - active 别名直接调用 `inspectProjectClassificationSummary` 并传入 `active`
    - shared 别名直接调用 `inspectProjectClassificationSummary` 并传入 `shared`
  - 快速入口接线：
    - Quick Actions
    - Hierarchy Tools
    - Command Palette
    - HDL Explorer title bar
    - Diagnostics root 右键菜单
- 验证:
  - npm run compile: 通过。
  - npm run lint: 通过。
  - npm test: 通过（77 passing）。
