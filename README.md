# HDL Helper <img src="images/icon.png" height="40" align="top"/>
```json
{
  "hdl-helper.linter.activeEngines": ["verible", "verilator"],
  "hdl-helper.linter.verilatorFlags": ["-Wno-WIDTH"]
}
```

### 3. Simulation Setup
Create a `.vscode/hdl_tasks.json` in your workspace to define simulation profiles:
```json
{
  "tasks": [
    {
      "name": "Run Base TB",
      "type": "hdl-sim",
      "tool": "iverilog",
      "top": "tb_top",
      "sources": ["rtl", "tb"],
      "filelist": ["sim/filelist.f"],
      "flags": ["-g2012"],
      "workingDirectory": ".",
      "buildDir": "build",
      "waveform": true,
      "waveformFormat": "fst",
      "autoOpenWaveform": true
    }
  ]
}
```
Simulation runtime settings (Workspace Settings):

```json
{
  "hdl-helper.simulation.tasksFile": ".vscode/hdl_tasks.json",
  "hdl-helper.simulation.iverilogPath": "iverilog",
  "hdl-helper.simulation.vvpPath": "vvp",
  "hdl-helper.simulation.buildDir": "build",
  "hdl-helper.simulation.defaultFlags": ["-g2012"],
  "hdl-helper.simulation.autoOpenWaveform": true
}
```

### 4. Project Exclusion
Exclude directories from project scanning:
```json
{
  "hdl-helper.project.excludeDirs": ["node_modules", ".srcs", ".sim", "ip"]
}
```

---

## ⌨️ Shortcuts & Commands

| Shortcut | Command | Description |
| --- | --- | --- |
| **`F12`** | Go to Definition | Jump to signal or module definition. |
| **`F2`** | Rename | Smart rename symbol across the project. |
| **`Ctrl+Alt+I`** | Instantiate Module | Copy Instantiation template. |
| **`Ctrl+Alt+W`** | Create Signals | Auto-declare signals for selected instance. |
| **`Ctrl+Alt+T`** | Generate Testbench | Quick testbench generation. |
| **`Shift+Alt+F`** | Format Document | Format using Verible rules. |

### All Commands
| Command | Description |
| --- | --- |
| `HDL: Instantiate Module` | Generate module instantiation template |
| `HDL: Create Signal Declarations` | Auto-declare signals for instance |
| `HDL: Generate Testbench` | Generate testbench template |
| `HDL: Visualize FSM (Mermaid)` | Generate FSM state diagram |
| `HDL: Generate AXI Interface` | AXI4-Lite/Full/Stream wizard |
| `HDL: Generate Memory IP` | FIFO/RAM generator wizard |
| `HDL: Generate Register Map` | CSV/JSON to RTL/C Header/MD |
| `HDL: Run Simulation` | Execute simulation task |
| `HDL: View Waveform` | Open FST/VCD waveform viewer |
| `HDL: Run Simulation (Hierarchy)` | Run simulation from Module Hierarchy view |
| `HDL: View Waveform (Hierarchy)` | Open waveform from Module Hierarchy view |
| `HDL: Run Vivado Synthesis` | Launch Vivado synthesis |
| `HDL: Run Vivado Implementation` | Launch Vivado implementation |
| `HDL: Set as Top Module` | Set top module for hierarchy |
| `HDL: Generate Interface Doc` | Generate Markdown documentation |
| `HDL: List All Linter Rules` | Show Verible lint rules |

---

## 📁 Project Structure

```raw
HDL-Helper/
├── src/
│   ├── commands/          # Command implementations
│   ├── generators/        # Code generators (AXI, Memory, Registers)
│   ├── linter/           # Multi-engine linter system
│   ├── project/          # Project management & AST parsing
│   ├── providers/        # VS Code providers (completion, hover, etc.)
│   ├── simulation/       # Simulation manager & waveform viewer
│   └── utils/            # Utilities (code gen, file I/O)
├── snippets/             # Code snippets (RTL, UVM, SVA, Constraints)
├── syntaxes/             # TextMate grammars
└── resources/            # WASM binaries (tree-sitter)
```

---

## ❓ FAQ

**Q: How do I view waveforms?**
A: Use **HDL Explorer > Module Hierarchy**: click `Run Simulation` / `View Waveform` from the view title or module row buttons. You can also run command `HDL: View Waveform` to open a waveform file manually.

**Q: Can I use different linting rules for different projects?**
A: Yes! Use VS Code **Workspace Settings** to override tool paths or active engines per project.

**Q: Why Verilator?**
A: Verilator is incredibly fast at catching "lint" errors that are actually "hardware" bugs (e.g., bit-width mismatches, undriven nets) which style-checkers like Verible might miss.

**Q: How do I generate a Register Map?**
A: Create a CSV or JSON file defining your registers, then use `HDL: Generate Register Map from File` command. The wizard will guide you through output options.

---

## 📖 Documentation

Starting from 2026-04-11, `README.md` is the canonical documentation entry.

- Historical archive reference: [hdl-helper-description.md](./hdl-helper-description.md)
- Snippet migration policy: `snippets/LEGACY_POLICY.md`
- Regression references: `resources/regression/`

---

## 📈 Project Report (2026-04-11)

### Current Stage

HDL Helper has entered a **release-sealed and structurally stable** phase for the V3.x line.

- Snippet system has been migrated to active namespaces: `sv.*`, `rtl.*`, `sva.*`, `sdc.*`, `xdc.*`, `sta.*`, `uvm.*`, plus template namespace `tpl.rtl.*`.
- Legacy snippet trees (`snippets/design`, `snippets/verification`) are no longer active maintenance targets.
- Simulation workflow has been consolidated around **Module Hierarchy** actions.
- Multi-workspace safety, filelist parsing, encoding fallback, and waveform fallback have all received hardening updates.

### Verified Release Health

Final seal checks (2026-04-11):

- `SEAL_CHK1_PACKAGE_LEGACY_REF_COUNT=0`
- `SEAL_CHK2_MISSING_CONTRIB_PATHS=0`
- `SEAL_CHK3_ACTIVE_PREFIX_TOTAL=270`
- `SEAL_CHK3_ACTIVE_PREFIX_DUP_GROUPS=0`
- `SEAL_CHK4_EMPTY_ACTIVE_JSON_FILES=0`
- `SEAL_CHK5_JSON_PARSE_ERRORS=0`
- `SEAL_CHK6_34_MAPPING_COUNT=2` (`sdc` + `xdc`)

### Growth Opportunities (Next Development Space)

1. Add `tpl.uvm.*` template family and associated regression checklist.
2. Introduce snippet CI lint gates (prefix uniqueness, JSON schema checks, semantic smoke tests).
3. Expand simulator backend support beyond Icarus (Verilator/XSIM/ModelSim/Questa orchestration).
4. Add workspace-level telemetry hooks for command latency and parser/index refresh health.
5. Build automated golden regression for snippets insertion and compile viability.
6. Unify docs into a versioned docs site pipeline (README as entry, generated detailed pages).

A full standalone report is available at `PROJECT_REPORT_2026-04-11.md`.

---

**Enjoy coding with HDL Helper!** 🚀
If you find bugs or have feature requests, please report them on [GitHub](https://github.com/Aligo-BTBKS/hdl-helper). Happy FPGA coding! 🎉

