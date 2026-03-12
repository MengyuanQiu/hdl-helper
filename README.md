# HDL Helper <img src="images/icon.png" height="40" align="top"/>

**The Ultimate All-in-One Professional IDE for FPGA & IC Development.**

**HDL Helper V3.0.0 is here!** 🚀

Stop treating VS Code like a text editor—turn it into a full-featured HDL IDE. **HDL Helper** combines industry-standard Linters, High-performance Simulation drivers, Waveform visualization, and Advanced Code Generation into one seamless extension.

---

## 🌟 What's New in V3.0.0? (The "IDE" Milestone)

We have evolved from a simple assistant into a comprehensive development environment:

* **🔬 Multi-Engine Linter Hub**: Choose between **Verilator**, **Verible**, and **Vivado xvlog**. Get real-time feedback from the same engines used in production.
* **⚡ Unified Code Generation**: Generate AXI4-Lite/Stream interfaces, Memory IPs (FIFO/RAM), and complex Register Maps directly from CSV/JSON definitions.
* **🌊 Simulation & Waveform Core**: Run simulations (Icarus Verilog supported) with one click via **CodeLens**. View **FST/VCD** waveforms directly in VS Code using the integrated high-performance Surfer viewer.
* **📊 FSM Visualization**: Instantly generate **Mermaid state diagrams** from your RTL `always` blocks to visualize complex state machines.
* **📦 IP Explorer & Project Management**: Browse Xilinx IPs (`.xci`) and manage complex multi-project hierarchies with **Smart Top Module** detection.

---

## ✨ Key Features

### 🌳 Project Intelligence & Hierarchy
* **Live Tree View**: Dynamic instantiation hierarchy in the Side Bar.
* **LSP Navigation**: High-accuracy Go-to-Definition, Find References, and Symbol Renaming powered by an optimized AST parser.
* **Rich Hover**: View module port definitions and header comments instantly while hovering over instances.

### 🛠️ Advanced Code Generation (`Ctrl+Alt+G`)
* **AXI Generator**: Guided wizards for AXI4-Lite, Full, and Stream (Master/Slave).
* **Memory IP**: Generate synthesizable Sync/Async FIFOs and parameterized RAMs.
* **Register Map**: Import CSV/JSON tables to generate **SystemVerilog RTL**, **C Headers**, and **Markdown documentation** in one go.
* **Smart Snippets**: Reorganized granular snippet library for RTL, UVM, SVA, and Constraints (XDC/SDC).

### 🔍 Professional Quality Control
* **Lint Quick Fixes**: One-click fixes for common style issues (e.g., trailing spaces, `always @(*)` to `always_comb`).
* **Interface Checking**: Automatic detection of port mismatches (missing or extra ports) between module definitions and instantiations.
* **Vivado Bridge**: Launch Vivado Synthesis and Implementation directly from VS Code and view utilization/timing reports.

---

## ⚙️ Configuration Guide

### 1. External Tools (Recommended)
To unlock the full potential, install and set paths for these tools:

| Tool | Usage | Setting ID |
| --- | --- | --- |
| **Verilator** | High-perf Linter | `hdl-helper.linter.verilatorPath` |
| **Verible** | Style/Format/LSP | `hdl-helper.linter.veriblePath` |
| **Vivado** | Synth/Impl/Fix | `hdl-helper.vivado.path` |
| **Icarus Verilog**| Simulation | `hdl-helper.simulation.iverilogPath` |

### 2. Simulation Setup
Create a `.vscode/hdl_tasks.json` in your workspace to define simulation profiles:
```json
{
  "tasks": [
    {
      "name": "Run Base TB",
      "target": "tb_top",
      "files": ["rtl/*.v", "tb/*.v"],
      "wave": "dump.fst"
    }
  ]
}
```

---

## ⌨️ Shortcuts Cheat Sheet

| Shortcut | Action | Description |
| --- | --- | --- |
| **`F12`** | Go to Definition | Jump to signal or module definition. |
| **`F2`** | Rename | Smart rename symbol across the project. |
| **`Ctrl + Alt + I`** | Instantiate | Copy Instantiation template. |
| **`Ctrl + Alt + W`** | Auto Wire | Auto-declare signals for selected instance. |
| **`Ctrl + Alt + T`** | Generate TB | Quick testbench generation. |
| **`Shift + Alt + F`** | Format | Format document using Verible rules. |

---

## ❓ FAQ

**Q: How do I view waveforms?**
A: After running a simulation via the **"Run Simulation"** CodeLens (appears above testbench modules), click the **"View Waveform"** CodeLens or use the command `HDL: View Waveform`.

**Q: Can I use different linting rules for different projects?**
A: Yes! Use VS Code **Workspace Settings** to override tool paths or active engines per project.

**Q: Why Verilator?**
A: Verilator is incredibly fast at catching "lint" errors that are actually "hardware" bugs (e.g., bit-width mismatches, undriven nets) which style-checkers like Verible might miss.

---

**Enjoy coding with HDL Helper!** 🚀
If you find bugs or have feature requests, please report them on GitHub. Happy FPGA coding! 🎉