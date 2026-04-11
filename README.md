# HDL Helper

**中文** | [English](#hdl-helper-1)

**HDL Helper** 是一款面向 FPGA/IC 工程师的 VS Code 全能型硬件描述语言（HDL）开发扩展。它将通用的代码编辑器升级为一个功能完备的专业硬件开发环境，覆盖了从代码编写、静态检查、工程导航、代码生成到仿真与波形查看的完整开发闭环。

## 核心能力

```
┌─────────────────────────────────────────────────────────────────┐
│                        HDL Helper                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ 代码生成      │  │ 多引擎检查    │  │ 仿真与波形            │  │
│  │ • AXI接口    │  │ • Verilator  │  │ • Icarus Verilog     │  │
│  │ • Memory IP  │  │ • Verible    │  │ • Surfer波形查看     │  │
│  │ • 寄存器映射  │  │ • Vivado     │  │ • FST/VCD支持        │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ 工程管理      │  │ 语言服务      │  │ EDA工具集成           │  │
│  │ • AST解析    │  │ • 跳转定义    │  │ • Vivado综合         │  │
│  │ • 层级视图    │  │ • 悬停提示    │  │ • Vivado实现         │  │
│  │ • IP浏览     │  │ • 符号重命名  │  │ • 报告解析           │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 主要特性

*   **多引擎语法检查**: 并发集成 Verilator (硬件语义)、Verible (代码风格) 和 Vivado xvlog (原生语法) 三大 Linter，全面保障代码质量。
*   **智能代码生成**: 提供向导式 AXI 接口、FIFO/RAM、寄存器映射 (CSV/JSON 驱动) 以及 Testbench 生成器，极大提升开发效率。
*   **一体化仿真与波形**: 通过 `hdl_tasks.json` 配置任务，直接在 VS Code 中启动 Icarus Verilog 仿真，并集成 FST/VCD 波形查看器。
*   **强大的工程管理**: 基于 Tree-sitter 的高性能 AST 解析器，提供模块层级视图、IP 浏览器和跨文件符号导航。
*   **专业的语言服务**: 支持 Go to Definition, Find All References, Rename Symbol, Hover 等核心 IDE 功能，提供流畅的编码体验。
*   **FSM 可视化**: 一键从 RTL 代码提取状态机逻辑，并以 Mermaid 图表形式可视化。
*   **Vivado 深度集成**: 直接在编辑器内调用 Vivado 进行综合与实现，并解析其报告。

## 快速开始

1.  **安装扩展**
    *   在 VS Code 扩展市场中搜索 "HDL Helper" 并点击安装。

2.  **(推荐) 安装外部工具**
    *   **Verilator** (Windows: `choco install verilator`, Linux: `apt install verilator`)
    *   **Verible** (从 [GitHub Releases](https://github.com/chipsalliance/verible/releases) 下载)
    *   **Icarus Verilog** (Windows: `choco install iverilog`, Linux: `apt install iverilog`)

3.  **打开项目**
    *   在 VS Code 中打开包含 `.v` / `.sv` 文件的项目文件夹，扩展将自动扫描并构建索引。

4.  **开始使用**
    *   使用代码片段 (`snippets`) 快速插入常用模板。
    *   通过命令面板 (`Ctrl+Shift+P`) 访问所有 HDL Helper 功能。

## 代码片段 (Snippets)

HDL Helper 提供了大量结构化的代码片段，涵盖 RTL、UVM、SVA 和约束等多个领域。当前活跃的命名空间包括：
`sv.*`, `rtl.*`, `sva.*`, `sdc.*`, `xdc.*`, `sta.*`, `uvm.*` 以及 `tpl.rtl.*`。

## 项目状态

截至 2026-04-11，HDL Helper V3.x 版本已进入“结构稳定 + 可发布”阶段，核心功能链路完备，适合生产环境使用。

---

# HDL Helper

**[中文](#hdl-helper)** | English

**HDL Helper** is a comprehensive Hardware Description Language (HDL) development extension for VS Code, designed specifically for FPGA/IC engineers. It transforms a general-purpose code editor into a full-featured professional hardware development environment, covering the entire development lifecycle from coding and static analysis to project navigation, code generation, simulation, and waveform viewing.

## Core Capabilities

```
┌─────────────────────────────────────────────────────────────────┐
│                        HDL Helper                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Code Gen     │  │ Multi-Linter │  │ Sim & Waveform       │  │
│  │ • AXI IF     │  │ • Verilator  │  │ • Icarus Verilog     │  │
│  │ • Memory IP  │  │ • Verible    │  │ • Surfer Viewer      │  │
│  │ • Reg Map    │  │ • Vivado     │  │ • FST/VCD Support    │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Proj Mgmt    │  │ Lang Services│  │ EDA Integration      │  │
│  │ • AST Parse  │  │ • Go to Def  │  │ • Vivado Synth       │  │
│  │ • Hierarchy  │  │ • Hover      │  │ • Vivado Impl        │  │
│  │ • IP Browser │  │ • Rename     │  │ • Report Parsing     │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Features

*   **Multi-Engine Linting**: Concurrently integrates three major linters—Verilator (hardware semantics), Verible (code style), and Vivado xvlog (native syntax)—to comprehensively ensure code quality.
*   **Intelligent Code Generation**: Offers wizard-driven generators for AXI interfaces, FIFOs/RAMs, register maps (driven by CSV/JSON), and testbenches, significantly boosting productivity.
*   **Integrated Simulation & Waveform**: Configure tasks via `hdl_tasks.json` to launch Icarus Verilog simulations directly within VS Code, with an integrated FST/VCD waveform viewer.
*   **Powerful Project Management**: Leverages a high-performance Tree-sitter-based AST parser to provide a module hierarchy view, IP browser, and cross-file symbol navigation.
*   **Professional Language Services**: Supports core IDE features like Go to Definition, Find All References, Rename Symbol, and Hover, delivering a smooth coding experience.
*   **FSM Visualization**: Extracts state machine logic from RTL code with one click and visualizes it as a Mermaid diagram.
*   **Deep Vivado Integration**: Invoke Vivado synthesis and implementation directly from the editor and parse its reports.

## Quick Start

1.  **Install the Extension**
    *   Search for "HDL Helper" in the VS Code Marketplace and click install.

2.  **(Recommended) Install External Tools**
    *   **Verilator** (Windows: `choco install verilator`, Linux: `apt install verilator`)
    *   **Verible** (Download from [GitHub Releases](https://github.com/chipsalliance/verible/releases))
    *   **Icarus Verilog** (Windows: `choco install iverilog`, Linux: `apt install iverilog`)

3.  **Open Your Project**
    *   Open your project folder containing `.v` / `.sv` files in VS Code. The extension will automatically scan and build an index.

4.  **Start Coding**
    *   Use code snippets to quickly insert common templates.
    *   Access all HDL Helper features via the Command Palette (`Ctrl+Shift+P`).

## Code Snippets

HDL Helper provides a rich set of structured code snippets covering RTL, UVM, SVA, and constraints. The currently active snippet namespaces are:
`sv.*`, `rtl.*`, `sva.*`, `sdc.*`, `xdc.*`, `sta.*`, `uvm.*`, and `tpl.rtl.*`.

## Project Status

As of 2026-04-11, the HDL Helper V3.x line has entered a "structurally stable and releasable" phase. Its core feature set is complete and ready for production use.