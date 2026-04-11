1. **Execution 总原则**
2. **Phase 0：开工前锁定项**
3. **Iteration 1～6 的逐步 checklist**
4. **每轮验收标准**
5. **建议的目录/代码分层**
6. **风险清单与回滚策略**
7. **第一周最小落地顺序**

我会尽量写成你可以直接放进项目任务板里的形式。

---

# 一、Execution 总原则

先把这几条当成硬约束，后面所有实现都按这个来。

## 架构硬约束

* `TreeProvider` 只负责渲染，不做分类、不做 target 解析、不做 hierarchy 决策。
* 一切工程语义入口统一从 `TargetContext` 获取。
* `project.json` 是主真相；heuristic 只作为兼容回退。
* 第一阶段使用 **deterministic snapshot rebuild**，不要先做复杂增量更新。
* 所有 fallback 都必须可见、可诊断，不能 silent guess。

## 产品硬约束

* 没有 `project.json` 时，现有用户工作流不能崩。
* 旧命令入口仍然可用。
* 新工作台是 additive，不是首轮直接替换全部旧视图。
* 每一轮都必须可回退。

---

# 二、Phase 0：开工前锁定项

这一段建议在真正写代码前先完成。

## 0.1 锁定内部核心类型

需要定义并提交第一版 TypeScript 类型：

* `Role`
* `PhysicalFileType`
* `SourceOfTruth`
* `NormalizedProjectConfig`
* `NormalizedSourceSet`
* `NormalizedTarget`
* `FileClassificationResult`
* `TargetContext`
* `WorkbenchState`
* `RunRecord`

### 验收

* 类型定义文件可编译
* 不依赖 UI 层
* 不依赖 VS Code TreeItem 结构

---

## 0.2 锁定状态模型接口

定义统一状态读写接口，至少包括：

* `getActiveProject()`
* `setActiveProject()`
* `getActiveTarget()`
* `setActiveTarget()`
* `getDesignTop()`
* `setDesignTop()`
* `getSimulationTop()`
* `setSimulationTop()`
* `getProjectConfigStatus()`
* `setProjectConfigStatus()`
* `getIndexStatus()`
* `setIndexStatus()`
* `getLastRunByTarget()`
* `setLastRunForTarget()`

### 验收

* 状态管理集中，不散落在 provider/manager 里
* 可以先用内存态 + workspace memento 实现

---

## 0.3 锁定回退策略文档

写一份简短 internal note，明确：

* `project.json` 不存在时：heuristic mode
* `project.json` 非法时：diagnostics + 只读 fallback
* `activeTarget` 无效时：回退策略
* hierarchy 构建失败时：仅 hierarchy 报错，不拖死 sources/tasks

---

## 0.4 锁定 feature flags

先在配置项里准备这些 flag：

* `hdl-helper.workbench.roleGroupedSources`
* `hdl-helper.workbench.dualHierarchy`
* `hdl-helper.projectConfig.enabled`
* `hdl-helper.targetDrivenRuns.enabled`

### 验收

* 默认值先保守
* internal/dev 环境可单独打开

---

# 三、建议的代码结构

建议先把结构搭出来，再往里填实现。

```text
src/
├── project/
│   ├── types.ts
│   ├── stateService.ts
│   ├── projectConfigService.ts
│   ├── classificationService.ts
│   ├── sourceSetService.ts
│   ├── targetContextService.ts
│   ├── hierarchyService.ts
│   ├── explorerViewModelBuilder.ts
│   └── projectManager.ts   // 逐步瘦身，最终变 orchestration
│
├── simulation/
│   ├── simManager.ts
│   └── runsService.ts
│
├── providers/
│   ├── hdlTreeProvider.ts
│   └── diagnosticsProvider.ts
│
├── commands/
│   ├── createProjectConfig.ts
│   ├── debugProjectClassification.ts
│   ├── debugActiveTargetContext.ts
│   └── ...
│
└── test/
    ├── fixtures/
    └── ...
```

---

# 四、Iteration 1（V1-A）：Role-grouped Sources UI Foundation

## 目标

先把“按工程角色分组”的 Sources 区块做出来，但先不替换旧 hierarchy 逻辑。

---

## 4.1 数据层 checklist

### 任务 A：实现 `ClassificationService` 最小版

支持输入：

* workspace 文件列表
* heuristic rules
* 可选 project config（先可空）

输出：

* `FileClassificationResult[]`

### 必做规则

* 路径规则：

  * `rtl/`, `src/`, `design/` → design
  * `tb/`, `sim/`, `testbench/` → simulation
  * `sva/`, `checker/`, `bind/`, `assert/` → verification
  * `constraints/`, `xdc/`, `sdc/` → constraints
  * `scripts/`, `tcl/`, `flow/` → scripts
  * `ip/`, `generated/`, `autogen/` → ip/generated
* 文件扩展规则：

  * `.xdc`, `.sdc`, `.tcl`, `.xci`
* 文件名规则：

  * `tb_*`, `*_tb`
  * `sva_*`, `*_bind`, `*_checker`

### 结果字段至少包含

* `uri`
* `physicalType`
* `rolePrimary`
* `roleSecondary`
* `sourceOfTruth`
* `inActiveTarget` 先允许默认 false

---

### 任务 B：实现 `ExplorerViewModelBuilder` 最小版

输入：

* classification results

输出：

* Project section 占位
* Sources 6 大组：

  * Design Sources
  * Simulation Sources
  * Verification Sources
  * Constraints
  * Scripts
  * IP / Generated

### 要求

* 同一文件只按主角色显示一次
* 未归类文件进入 `Unassigned / Other HDL Files`

---

### 任务 C：改造 `hdlTreeProvider.ts`

要求：

* 只消费 ViewModel
* 不在 provider 里写路径/后缀判断
* 旧 Module Hierarchy 暂时保留为旧 section 或 fallback

---

## 4.2 UI 层 checklist

### 任务 D：增加 section 节点

在 HDL Explorer 中新增：

* Sources

  * Design Sources
  * Simulation Sources
  * Verification Sources
  * Constraints
  * Scripts
  * IP / Generated
  * Unassigned / Other HDL Files

### 任务 E：节点元信息

每个文件节点建议显示：

* 文件名
* 相对路径
* 可选 role 标记
* 可选 sourceOfTruth 标记（先 debug only 也行）

---

## 4.3 调试与观察 checklist

### 任务 F：新增 debug command

* `HDL: Debug Current Project Classification`

输出至少包括：

* file path
* rolePrimary
* roleSecondary
* sourceOfTruth

---

## 4.4 测试 checklist

### 必测 fixture

* 纯 rtl 工程
* rtl + tb + sva
* constraints/scripts/ip 存在
* 无 project config

### 验收标准

* 6 大分组可见
* 现有命令不回归
* 误分类不会导致崩溃
* Unassigned 能看到文件，不会“消失”

---

# 五、Iteration 2（V1-B）：Dual Hierarchy

## 目标

拆出：

* Design Hierarchy
* Simulation Hierarchy

并把 top 状态分离。

---

## 5.1 数据层 checklist

### 任务 A：扩展状态模型

新增并接通：

* `designTop`
* `simulationTop`

### 任务 B：实现 `HierarchyService` 最小版

输入：

* top module name
* scoped file list

输出：

* hierarchy tree

### 任务 C：实现 `TargetContextService` 最小占位版

即使此时还没有 project.json，也要能从：

* designTop / simulationTop
* heuristic file scope
  推导出最小 TargetContext

---

## 5.2 UI 层 checklist

### 任务 D：新增 hierarchy section

* Design Hierarchy
* Simulation Hierarchy

### 任务 E：增加对应操作

* Set as Design Top
* Set as Simulation Top

### 任务 F：保持旧行为兼容

旧的 `Set as Top` 可以暂时保留，但内部要映射到更明确的设计：

* 如果当前是 tb/ sim 文件上下文，优先设 simulation top
* 否则设 design top
  或者直接开始弃用并引导到新命令

---

## 5.3 测试 checklist

### 必测场景

* 一个 design top + 一个 sim top
* 改 simulation top 不影响 design hierarchy
* hierarchy 不再依赖全仓模块扫描结果

### 验收标准

* 两棵树都能独立工作
* hierarchy 构建失败时只影响本 section
* 旧 run sim / waveform 不回归

---

# 六、Iteration 3（V2-A）：Minimal `project.json` + Config Diagnostics

## 目标

引入显式 project 边界。

---

## 6.1 数据层 checklist

### 任务 A：实现 `ProjectConfigService`

支持：

* 读取 `.hdl-helper/project.json`
* schema 校验
* 返回 `NormalizedProjectConfig`

### 最小 schema 支持字段

* `version`
* `name`
* `root`
* `sourceSets`
* `tops`
* `targets`
* `activeTarget`

---

### 任务 B：实现 config fallback 逻辑

* 无配置：heuristic mode
* 配置非法：diagnostics + 只读 fallback
* 配置存在：classification 优先听 config

---

### 任务 C：把 classification 接入 truth priority

优先级：

1. `project.json`
2. target-local override
3. filelist/task refs
4. heuristic

当前这一轮至少先做到：

* `project.json` > heuristic

---

## 6.2 命令与 UI checklist

### 任务 D：新增命令

* `HDL: Create Project Config`

### 可选再加

* `HDL: Generate Project Config from Workspace`

---

### 任务 E：Diagnostics section 增加 config issues

显示：

* config file missing（提示级）
* parse error
* invalid target ref
* invalid sourceSet ref
* top missing

---

## 6.3 测试 checklist

### 必测 fixture

* 合法 project.json
* 非法 project.json
* 无 project.json
* sourceSets 覆盖 heuristic
* tops / activeTarget 生效

### 验收标准

* 有 config 时按 config 分组
* 无 config 时仍可用
* 错误配置有明确诊断，不 silent fail

---

# 七、Iteration 4（V2-B）：Target-driven Runs and Tasks

## 目标

让 run / waveform / logs 围绕 active target。

---

## 7.1 数据层 checklist

### 任务 A：扩展 `TargetContextService`

effective target context 至少要算出：

* target id
* kind
* top
* resolved files
* tasksFile / filelist
* toolProfile（可空）
* includeDirs / defines（可空）

### 任务 B：实现 `RunsService`

保存：

* recent runs by target key
* last waveform by target key
* last log by target key

建议先存：

* workspaceState/memento
* 后续再考虑文件落盘

---

## 7.2 仿真集成 checklist

### 任务 C：改造 `simManager.ts`

让它支持：

* 从 `TargetContext` 解析 task
* 按 active target 运行
* 结果回写 `RunsService`

### 任务 D：波形和日志关联 target

不是只按文件名，而是按：

* target id
* task name
* timestamp

---

## 7.3 UI checklist

### 任务 E：新增 `Tasks & Runs` section

至少显示：

* Simulation Tasks
* Recent Runs
* Last Waveform
* Last Logs

### 任务 F：支持操作

* Run
* Re-run
* Open Log
* Open Waveform

---

## 7.4 测试 checklist

### 必测场景

* 一个 project 多个 sim target
* recent runs 按 target 分组
* 上次 waveform/log 可重新打开
* 没配置 tasks 时 graceful fail

### 验收标准

* target context 能驱动运行
* recent run 可回显
* 失败类型可区分

---

# 八、Iteration 5（V3-A）：First-class SourceSet / FileSet Engine

## 目标

让 source set 成为真正可执行语义单元。

---

## 8.1 数据层 checklist

### 任务 A：实现 `SourceSetService`

支持：

* source set 展开为实际文件集
* includeDirs / defines 组合
* primary / secondary role
* shared file 处理

### 任务 B：明确 shared file 行为

* UI 默认只显示一次
* secondary references 作为 metadata
* effective target 解析时允许同文件被多个 set 引用

---

## 8.2 Target 解析 checklist

### 任务 C：TargetContext 真正改为由 SourceSet 驱动

而不是散落靠 heuristic。

### 任务 D：引入 `filelist` 策略

建议第一版默认：

* simulation target：filelist 可收窄 resolved files
* synthesis/implementation target：filelist 可作为显式主边界

---

## 8.3 UI checklist

### 任务 E：增加 target/source set details

至少能看到：

* 哪些 source sets 组成当前 target
* 每个 source set 的 resolved file count
* shared file metadata

---

## 8.4 测试 checklist

### 必测 fixture

* shared file between design and simulation
* multiple sourceSets compose one target
* filelist-narrowed target
* generated files in separate set

### 验收标准

* 每个 target 的 resolved files 可预测、可调试
* 不会因 shared file 出现重复/漏文件

---

# 九、Iteration 5.5（V3-A+）：Project Bootstrap and Inspector

## 目标

提高 adoption 和 debuggability。

---

## 9.1 Bootstrap checklist

### 任务 A：新增命令

* `HDL: Generate Project Config from Workspace`

### 初版能力

* 扫描目录
* 猜 sourceSets
* 猜 design/simulation tops
* 输出 project.json 初稿

---

## 9.2 Inspector checklist

### 任务 B：做最小 Inspector / Details

点选 file / source set / target 时显示：

* rolePrimary
* roleSecondary
* sourceOfTruth
* inActiveTarget
* referencedByTargets
* resolvedPath
* effective includeDirs / defines

### 如果 UI 成本高

先用 command 或 output channel 实现 debug 版也可以。

---

## 9.3 调试命令 checklist

* `HDL: Debug Current Project Classification`
* `HDL: Debug Active Target Context`

### 验收标准

* bootstrap 生成的 config 可直接用
* classification / target context 可观测

---

# 十、Iteration 6（V3-B）：Diagnostics and Governance Hardening

## 目标

让语义模型可观测、可门禁、可发布。

---

## 10.1 Diagnostics checklist

### 任务 A：增加 Project Config Issues 分组

* missing sourceSet
* duplicate target
* invalid top
* empty resolved files
* broken filelist
* unknown tool profile

### 任务 B：增加 Toolchain Health by target profile

至少检查：

* linter backend
* simulator backend
* vivado / xvlog / xsim 等路径（若 profile 需要）

---

## 10.2 Governance / CI checklist

### 任务 C：加入 CI 检查

* project config schema validation
* target name uniqueness
* sourceSet reference integrity
* missing files detection
* maybe snapshot sanity

### 任务 D：release checklist 更新

加入：

* semantic workbench gates
* fixture pass
* debug commands sanity
* fallback mode sanity

---

## 10.3 验收标准

* misconfiguration 明确可见
* CI 能拦下典型坏配置
* 发布流程具备工程语义门禁

---

# 十一、执行期间每轮通用 checklist

这部分每一轮都跑。

## 11.1 编译与质量

* TypeScript compile pass
* ESLint pass
* 当前改动文件 diagnostics pass

## 11.2 行为回归

* Instantiate Module
* Create Signal Declarations
* Generate Testbench
* Run Simulation
* View Waveform
* Set Top / hierarchy navigation
* 当前 snippets / generators 不回归

## 11.3 Explorer sanity

* section 正常渲染
* 节点数量大致符合预期
* 无明显卡死
* 无空白视图误导

## 11.4 兼容性

* 无 `project.json` 工程仍可用
* 旧配置仍可跑
* 新 feature flag 关闭时不影响旧路径

---

# 十二、Fixture / Regression checklist

建议你尽快建这些 regression 工作区：

## 必备 fixture

1. `pure_rtl_project`
2. `rtl_tb_sva_project`
3. `multi_top_project`
4. `heuristic_only_project`
5. `shared_file_project`
6. `filelist_narrow_project`

## 每个 fixture 至少验证

* sources grouping
* hierarchy root
* top selection
* target context
* run resolution
* diagnostics behavior

---

# 十三、建议的内部文件与接口第一版

## `src/project/types.ts`

放：

* Role
* PhysicalType
* NormalizedProjectConfig
* NormalizedTarget
* FileClassificationResult
* TargetContext
* WorkbenchState

## `src/project/stateService.ts`

放：

* 状态读写
* event emit
* memento/session override

## `src/project/projectConfigService.ts`

放：

* read / validate / normalize project.json

## `src/project/classificationService.ts`

放：

* classifyFile(uri, ctx)
* classifyWorkspace(files, ctx)

## `src/project/sourceSetService.ts`

放：

* resolveSourceSet(name)
* resolveTargetFiles(target)

## `src/project/targetContextService.ts`

放：

* getActiveTargetContext()
* resolveTargetContext(targetId)

## `src/project/hierarchyService.ts`

放：

* buildDesignHierarchy(ctx)
* buildSimulationHierarchy(ctx)

## `src/simulation/runsService.ts`

放：

* recordRun(targetId, runRecord)
* getRecentRuns(targetId)
* getLastWaveform(targetId)
* getLastLog(targetId)

## `src/project/explorerViewModelBuilder.ts`

放：

* buildWorkbenchViewModel(state, project, classifications, contexts, runs, diagnostics)

---

# 十四、最小第一周执行清单

这是你现在最应该照着做的。

## Day 1

* 建 `types.ts`
* 建 `stateService.ts`
* 建 `projectConfigService.ts` skeleton
* 建 `classificationService.ts` skeleton

## Day 2

* 实现 heuristic classifier
* 加 debug command：Project Classification
* 输出 classification 结果

## Day 3

* 建 `explorerViewModelBuilder.ts`
* 让 Sources 6 大组显示出来
* 保留 legacy hierarchy

## Day 4

* 接 feature flag
* 跑第一批 fixture
* 修 role grouping 问题

## Day 5

* 建 `targetContextService.ts` skeleton
* 建 designTop / simulationTop state
* 准备 Iteration 2

---

# 十五、现在开工前最后确认的 6 件事

你可以把这 6 个问题在开工前自己勾掉：

* 是否接受 `project.json` 是主真相？
* 是否接受 TreeProvider 只渲染？
* 是否接受第一版只做 snapshot rebuild？
* 是否接受 heuristic mode 只是 fallback？
* 是否接受 shared file 默认只显示一次？
* 是否接受先做 role-grouped sources，再做 dual hierarchy？

如果这 6 个你都点头，那就可以直接开始 execution 了。

---

# 十六、最终建议

**这份 checklist 已经够你开工了。**

最重要的是别乱顺序。
一定按这个依赖关系来：

**类型/状态 → 分类 → ViewModel → Sources 分组 → Dual Hierarchy → project.json → target-driven runs → source set engine → diagnostics/governance**

只要你按这个顺序推进，返工会少很多。

