# HDL Helper V3.2.0 Release Notes

**Release Date**: 2026-04-11  
**Tag**: V3.2.0  
**Status**: Stable Release

---

## 中文版本

### 版本定位

V3.2.0 是 HDL Helper 的**稳定性与工程化收口版本**，完成了仿真入口重构、多工作区支持优化、Snippets 体系迁移与文档合并，为后续工程工作台架构升级奠定了坚实基础。

### 重点更新

#### 1. 仿真入口优化
- **从 CodeLens 迁移到 Module Hierarchy**：仿真入口从 TB 文件顶部按钮迁移到侧边栏 HDL Explorer 的 Module Hierarchy 视图，提供更统一的工程操作入口。
- **新增命令**：
  - `HDL: Run Simulation (Hierarchy)` - 从层级视图运行仿真
  - `HDL: View Waveform (Hierarchy)` - 从层级视图查看波形
- **视图集成**：Module Hierarchy 标题栏与模块行均提供仿真/波形按钮，操作更顺畅。

#### 2. 多工作区支持增强
- **工作区解析优化**：Run Simulation / View Waveform 命令增加来源文档 URI 透传，避免多根工作区固定取首个根目录。
- **配置隔离**：工程扫描配置按 folder-scope 读取，支持不同工作区独立配置。
- **模块解析改进**：同工作区模块优先，降低同名模块串仓风险。

#### 3. 仿真功能完善
- **任务选择器**：同 top 多 task 场景支持交互选择。
- **自动源文件收集**：未配置 sources/filelist 时自动收集工作区 HDL 源文件。
- **Filelist 增强**：支持环境变量展开（$VAR / ${VAR} / %VAR%）。
- **波形回退策略**：优先同名波形，未命中时自动回退 build 目录最新波形。
- **Windows 编码支持**：仿真命令输出支持 GBK 回退，避免中文乱码。

#### 4. Snippets 体系重构
- **新命名空间**：从 legacy 目录迁移到新体系（sv/rtl/sva/constraints/uvm/templates）。
- **前缀统一**：`sv.*`、`rtl.*`、`sva.*`、`sdc.*`、`xdc.*`、`sta.*`、`uvm.*`、`tpl.rtl.*`。
- **工程化收口**：
  - 解决前缀冲突（interface vs if）
  - 补齐高频基础片段（reg.no_rst、rv.demux、counter、timer 等）
  - 收口重复实现（保留唯一主实现）
  - 修正命名与描述边界
- **Templates 层**：新增 RV/FSM/CDC 模板集（tpl.rtl.*）。

#### 5. 文档合并与项目报告
- **README 升级**：合并 hdl-helper-description.md，成为主文档入口。
- **项目报告**：新增 PROJECT_REPORT_2026-04-11.md，沉淀当前阶段、质量指标与发展空间。
- **归档策略**：hdl-helper-description.md 转为历史追踪文档。

### 质量指标

```
✅ ESLint: 0 error / 0 warning
✅ TypeScript 编译: 通过
✅ 测试套件: 1 passing (含 filelist 解析测试)
✅ 回归样例: 覆盖 A1/A2/B1/B3 场景
✅ Snippets 前缀: 0 重复
```

### 兼容性

- **向后兼容**：所有现有命令与配置保持兼容。
- **迁移提示**：Snippets 已切换到新命名空间，legacy 目录只读。
- **平台支持**：Windows/Linux/macOS 全平台支持。

### 后续路线

V3.2.0 之后，HDL Helper 将进入**工程工作台架构升级**阶段：
- **Iteration 1-2**：Role-grouped Sources + Dual Hierarchy
- **Iteration 3-4**：project.json 配置驱动 + Target-driven Runs
- **Iteration 5-6**：SourceSet Engine + Diagnostics Hardening

详见 `iteration_plan.md` 与 `execute_checklist.md`。

---

## English Version

### Version Positioning

V3.2.0 is a **stability and engineering consolidation release** for HDL Helper, completing simulation entry refactoring, multi-workspace support optimization, snippets system migration, and documentation consolidation, laying a solid foundation for the upcoming workbench architecture upgrade.

### Key Updates

#### 1. Simulation Entry Optimization
- **Migrated from CodeLens to Module Hierarchy**: Simulation entry moved from TB file top buttons to HDL Explorer's Module Hierarchy view, providing a more unified project operation entry.
- **New Commands**:
  - `HDL: Run Simulation (Hierarchy)` - Run simulation from hierarchy view
  - `HDL: View Waveform (Hierarchy)` - View waveform from hierarchy view
- **View Integration**: Module Hierarchy title bar and module rows provide simulation/waveform buttons for smoother operations.

#### 2. Multi-Workspace Support Enhancement
- **Workspace Resolution Optimization**: Run Simulation / View Waveform commands now pass source document URI, avoiding fixed first root directory in multi-root workspaces.
- **Configuration Isolation**: Project scanning configuration reads per folder-scope, supporting independent configuration for different workspaces.
- **Module Resolution Improvement**: Same-workspace modules prioritized, reducing cross-workspace name collision risk.

#### 3. Simulation Feature Completion
- **Task Selector**: Interactive selection for multiple tasks with same top.
- **Auto Source Collection**: Automatically collects workspace HDL sources when sources/filelist not configured.
- **Filelist Enhancement**: Supports environment variable expansion ($VAR / ${VAR} / %VAR%).
- **Waveform Fallback Strategy**: Prioritizes same-name waveform, falls back to latest in build directory.
- **Windows Encoding Support**: Simulation command output supports GBK fallback, avoiding Chinese garbled text.

#### 4. Snippets System Refactoring
- **New Namespace**: Migrated from legacy directory to new system (sv/rtl/sva/constraints/uvm/templates).
- **Unified Prefixes**: `sv.*`, `rtl.*`, `sva.*`, `sdc.*`, `xdc.*`, `sta.*`, `uvm.*`, `tpl.rtl.*`.
- **Engineering Consolidation**:
  - Resolved prefix conflicts (interface vs if)
  - Added high-frequency basic snippets (reg.no_rst, rv.demux, counter, timer, etc.)
  - Consolidated duplicate implementations (kept single primary implementation)
  - Corrected naming and description boundaries
- **Templates Layer**: Added RV/FSM/CDC template sets (tpl.rtl.*).

#### 5. Documentation Consolidation and Project Report
- **README Upgrade**: Merged hdl-helper-description.md, becoming the main documentation entry.
- **Project Report**: Added PROJECT_REPORT_2026-04-11.md, documenting current stage, quality metrics, and development roadmap.
- **Archive Strategy**: hdl-helper-description.md converted to historical tracking document.

### Quality Metrics

```
✅ ESLint: 0 error / 0 warning
✅ TypeScript Compilation: Passed
✅ Test Suite: 1 passing (including filelist parsing test)
✅ Regression Samples: Covers A1/A2/B1/B3 scenarios
✅ Snippets Prefixes: 0 duplicates
```

### Compatibility

- **Backward Compatible**: All existing commands and configurations remain compatible.
- **Migration Notice**: Snippets switched to new namespace, legacy directory is read-only.
- **Platform Support**: Full support for Windows/Linux/macOS.

### Roadmap

After V3.2.0, HDL Helper will enter the **workbench architecture upgrade** phase:
- **Iteration 1-2**: Role-grouped Sources + Dual Hierarchy
- **Iteration 3-4**: project.json configuration-driven + Target-driven Runs
- **Iteration 5-6**: SourceSet Engine + Diagnostics Hardening

See `iteration_plan.md` and `execute_checklist.md` for details.

---

## Installation

### From VS Code Marketplace
Search for "HDL Helper" in VS Code Extensions and click Install.

### From VSIX
Download `hdl-helper-3.2.0.vsix` from GitHub Releases and install via:
```bash
code --install-extension hdl-helper-3.2.0.vsix
```

---

## Upgrade Notes

### For Existing Users
- No breaking changes, all features work as before
- Snippets: New prefixes available, legacy prefixes still work
- Simulation: CodeLens removed, use Module Hierarchy buttons instead

### For New Users
- Follow Quick Start in README.md
- Install recommended external tools (Verilator, Verible, Icarus Verilog)
- Explore snippets with new prefixes (sv.*, rtl.*, etc.)

---

## Known Issues

None reported for this release.

---

## Contributors

- Core Team: HDL Helper Development Team
- Repository: https://github.com/MengyuanQiu/hdl-helper

---

## Links

- **GitHub Repository**: https://github.com/MengyuanQiu/hdl-helper
- **VS Code Marketplace**: Search "HDL Helper"
- **Documentation**: See README.md in repository
- **Issue Tracker**: https://github.com/MengyuanQiu/hdl-helper/issues

---

**Thank you for using HDL Helper!**
