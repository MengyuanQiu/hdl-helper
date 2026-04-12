# HDL Helper Workbench Settings Guide

**Date**: 2026-04-11

## Goal

This guide lists workbench-related settings that can be configured directly in VS Code Settings UI, so users do not need to edit source code to adjust explorer behavior.

## How To Open Settings UI

1. Run command: `Preferences: Open Settings (UI)`
2. Search keyword: `HDL Helper`
3. Adjust settings under `HDL Helper` section

 You can also run extension command:
 - Command Palette: run `HDL: Open Workbench Settings Guide` to open this document directly
 - Quick Actions: run `HDL: Quick Actions` and choose `Open Workbench Settings Guide`

## Dual Hierarchy Diagnostics Entry

- Command Palette: `HDL: Debug Dual Hierarchy State`
- Quick Actions: `HDL: Quick Actions` -> `Debug Dual Hierarchy State`
- Command Palette: `HDL: Debug Active Target Context`
- Quick Actions: `HDL: Quick Actions` -> `Debug Active Target Context`
- Command Palette: `HDL: Debug Recent Runs By Target`
- Quick Actions: `HDL: Quick Actions` -> `Debug Recent Runs By Target`
- Command Palette: `HDL: Debug Current Project Classification`
- Quick Actions: `HDL: Quick Actions` -> `Debug Current Project Classification`
- Command Palette: `HDL: Debug Project Classification (View...)`
- Quick Actions: `HDL: Quick Actions` -> `Debug Project Classification (View...)`
- Command Palette: `HDL: Inspect Project Classification (Pick File)`
- Quick Actions: `HDL: Quick Actions` -> `Inspect Project Classification (Pick File)`
- Command Palette: `HDL: Inspect Project Classification Summary`
- Quick Actions: `HDL: Quick Actions` -> `Inspect Project Classification Summary`
- Quick Actions: `HDL: Quick Actions` -> `Inspect Project Classification (Active Files)`
- Quick Actions: `HDL: Quick Actions` -> `Inspect Project Classification (Shared Files)`
- Command Palette: `HDL: Debug Project Classification (All)`
- Quick Actions: `HDL: Quick Actions` -> `Debug Project Classification (All)`
- Command Palette: `HDL: Debug Project Classification (Overview)`
- Quick Actions: `HDL: Quick Actions` -> `Debug Project Classification (Overview)`
- Command Palette: `HDL: Debug Project Classification (Details)`
- Quick Actions: `HDL: Quick Actions` -> `Debug Project Classification (Details)`
- Command Palette: `HDL: Open Project Config`
- Quick Actions: `HDL: Quick Actions` -> `Open Project Config`
- Command Palette: `HDL: Open Last Waveform (Active Target)`
- Quick Actions: `HDL: Quick Actions` -> `Open Last Waveform (Active Target)`
- Command Palette: `HDL: Open Last Log (Active Target)`
- Quick Actions: `HDL: Quick Actions` -> `Open Last Log (Active Target)`
- Command Palette: `HDL: Open Recent Runs`
- Quick Actions: `HDL: Quick Actions` -> `Open Recent Runs`
- Command Palette: `HDL: Open Last Run Artifacts (Active Target)`
- Quick Actions: `HDL: Quick Actions` -> `Open Last Run Artifacts (Active Target)`
- Command Palette: `HDL: Rerun Active Target`
- Quick Actions: `HDL: Quick Actions` -> `Rerun Active Target`
- Command Palette: `HDL: Run Active Target Simulation`
- Quick Actions: `HDL: Quick Actions` -> `Run Active Target Simulation`
- Command Palette: `HDL: Open Simulation Tasks File`
- Quick Actions: `HDL: Quick Actions` -> `Open Simulation Tasks File`
- Command Palette: `HDL: Open Dual Hierarchy Regression Checklist`
- Quick Actions: `HDL: Quick Actions` -> `Open Dual Hierarchy Regression Checklist`

## Toolbar Optimization

- The hierarchy title bar is intentionally simplified to reduce icon noise.
- Use `HDL: Open Hierarchy Tools` (single tools icon) to access:
  - Workbench Settings
  - Simulation Settings
  - Simulation Tasks File
  - Workbench Settings Guide
  - Dual Hierarchy Regression Checklist
  - Debug Dual Hierarchy State
  - Debug Active Target Context
  - Debug Recent Runs By Target
  - Open Project Config
  - Open Last Waveform (Active Target)
  - Open Last Log (Active Target)
  - Open Recent Runs
  - Open Last Run Artifacts (Active Target)
  - Rerun Active Target
  - Run Active Target Simulation
  - Inspect Project Classification (Pick File)
  - Inspect Project Classification Summary
  - Inspect Project Classification (Active Files)
  - Inspect Project Classification (Shared Files)
  - Clear Top Module
- In `Hierarchy Tools`, entries are grouped with prefixes for faster scanning:
  - `[Settings] ...`
  - `[Diagnostics] ...`
  - `[Action] ...`

## Core Workbench Toggles

- `hdl-helper.workbench.roleGroupedSources`
  - Enable role-grouped Sources view in HDL Explorer.
  - `false`: legacy view behavior
  - `true`: show semantic source groups

- `hdl-helper.workbench.dualHierarchy`
  - Enable split Design/Simulation hierarchy mode.
  - Depends on `hdl-helper.workbench.roleGroupedSources=true`.
  - When enabled, explorer shows `Design Hierarchy` and `Simulation Hierarchy`.
  - Right-click module commands become available:
    - `HDL: Set as Design Top`
    - `HDL: Set as Simulation Top`

- `hdl-helper.projectConfig.enabled`
  - Enable project.json-driven classification and context.
  - When enabled, explorer shows `Diagnostics` section with project config issues (missing/invalid config, unresolved target tops, validation warnings, and active-target fallback issues).
  - Active target context now resolves non-empty `resolvedFiles` from configured source sets using include/exclude patterns.
  - Source set file resolution is now centralized via `SourceSetService`, and `TargetContextService` consumes that service as the single source-set resolution path.
  - Shared files referenced by multiple source sets now keep deterministic `primary role + secondary roles` semantics in classification results, and Sources tooltip shows secondary roles plus matched source set names.
  - `HDL: Debug Current Project Classification` now includes observability summary for shared-file count, active-target-covered file count, and per-source-set file coverage.
  - Classification debug output now uses a reusable report formatter template (`formatClassificationDebugReport`), so the same output model can be reused by future inspector/detail views.
  - The formatter input/observability structures are now defined in shared project types (`ClassificationDebugReportInput`, `ClassificationObservabilityStats`) to avoid command-local type drift.
  - Classification debug generation now follows `section model -> text renderer` (`buildClassificationDebugSections` + `renderClassificationDebugSections`), allowing future inspector views to consume structured sections directly.
  - Classification sections now carry stable metadata (`id`, `type`) so downstream inspector/detail views can map, filter, and render sections deterministically without parsing titles.
  - Section rendering now supports unified priority and filter strategy (`getClassificationDebugSectionPriority`, preset-based type selection, and include/exclude filters), enabling consistent inspector view slicing (overview/details).
  - Use `HDL: Debug Project Classification (View...)` to run classification debug with preset output scope:
    - `All Sections`
    - `Overview`
    - `Details Only`
  - Use `HDL: Inspect Project Classification (Pick File)` to select scope preset and classified file interactively, then inspect full metadata in the classification output channel.
  - Use `HDL: Inspect Project Classification Summary` to inspect aggregated counters (sourceOfTruth/role/source-set coverage) under the selected scope preset.
  - Scope presets include:
    - `all`
    - `active`
    - `shared`
    - `project-config`
    - `heuristic`
  - Programmatic calls can pass scope via command argument object/string, for example: `active` / `{ scope: 'shared' }`.
  - The same command can be invoked programmatically with a preset argument (for automation/buttons), e.g. `overview` / `details` / `all`.
  - Alias commands are also available for direct invocation without arguments:
    - `HDL: Debug Project Classification (All)`
    - `HDL: Debug Project Classification (Overview)`
    - `HDL: Debug Project Classification (Details)`
  - Fast-path UI entries:
    - HDL Explorer title bar: direct All/Overview/Details commands
    - Diagnostics root context menu: direct All/Overview/Details commands

- `hdl-helper.targetDrivenRuns.enabled`
  - Enable target-oriented run management.
  - When enabled, each simulation run stores the latest run result under a target key in workspace state.
  - Explorer adds `Tasks and Runs` section with four subsections:
    - `Simulation Tasks`
    - `Recent Runs`
    - `Last Waveform`
    - `Last Logs`
  - Active target entries are prioritized and tagged with `[ACTIVE]` in `Recent Runs`, `Last Waveform`, and `Last Logs`.
  - Use `HDL: Open Simulation Tasks File` to open configured simulation task file (auto-create template if missing).
  - In `Simulation Tasks`, click a task item (or right-click and run `HDL: Run Simulation Task Item`) to trigger simulation for that task top.
  - Use `HDL: Debug Recent Runs By Target` to inspect current stored run records.
  - Use `HDL: Open Last Waveform (Active Target)` to reopen waveform by active target context.
  - Use `HDL: Open Last Log (Active Target)` to reopen latest run log by active target context.
  - Use `HDL: Open Recent Runs` to browse recent run records and open waveform/log interactively (active target record is prioritized and marked).
  - Use `HDL: Open Last Run Artifacts (Active Target)` for one-step reopen of the newest available artifact in active target run context.
  - Active target resolution for run-related commands is centralized to a single runs service to keep command behavior consistent across waveform/log/recent-runs/rerun actions.
  - Use `HDL: Rerun Active Target` to rerun simulation with the latest top from the active target run record.
  - Use `HDL: Run Active Target Simulation` to resolve active target context and run directly:
    - project config mode: run an ad-hoc context-driven task (prefers active target `filelist` and `top`)
    - fallback mode: warn and fall back to heuristic top simulation
  - `Run Active Target Simulation` is executed via `SimManager.runTargetContext(...)` so target context fields (`resolvedFiles`, `includeDirs`, `defines`, `filelist`) flow through one simulation entry point.
  - When active target resolution degrades to heuristic fallback, run records are stored under `heuristic:<top>` target key for consistent artifact lookup.
  - Failed run records carry a failure type (`precheck` / `compile` / `runtime` / `unsupported`) in Recent Runs, Explorer `Tasks and Runs`, and debug output.
  - In `Tasks and Runs`, click a run record item to open artifacts for that target record.
  - In `Tasks and Runs`, right-click a run record and run `HDL: Rerun Active Target` to rerun that specific target record directly.
  - In `Last Waveform` / `Last Logs`, click target items to directly reopen artifact files from stored run records.

## Sources View UI Behavior Settings

- `hdl-helper.workbench.sources.showLegacyHierarchy`
  - `true`: show `Module Hierarchy (Legacy)` when role-grouped Sources is enabled.
  - `false`: hide legacy section, show Sources-only workbench view.

- `hdl-helper.workbench.sources.showEmptyGroups`
  - `true`: keep zero-count groups visible.
  - `false`: hide empty groups for a compact view.

## Sources File Discovery Settings

- `hdl-helper.workbench.sources.includePatterns`
  - Glob patterns used by Sources scan.
  - Default includes HDL + constraints + scripts related files.

- `hdl-helper.workbench.sources.excludePatterns`
  - Glob patterns excluded from Sources scan.
  - Default excludes build outputs and third-party directories.

## Heuristic Compatibility Setting

- `hdl-helper.workbench.heuristic.defaultHdlRole`
  - Controls default role when an HDL file path does not match known path/name rules.
  - Values:
    - `design` (default)
    - `unassigned`

## Recommended Presets

### Preset A: Transition Mode (recommended)

```json
{
  "hdl-helper.workbench.roleGroupedSources": true,
  "hdl-helper.workbench.sources.showLegacyHierarchy": true,
  "hdl-helper.workbench.dualHierarchy": false,
  "hdl-helper.workbench.sources.showEmptyGroups": true,
  "hdl-helper.workbench.heuristic.defaultHdlRole": "design"
}
```

### Preset B: Compact Sources-first Mode

```json
{
  "hdl-helper.workbench.roleGroupedSources": true,
  "hdl-helper.workbench.dualHierarchy": false,
  "hdl-helper.workbench.sources.showLegacyHierarchy": false,
  "hdl-helper.workbench.sources.showEmptyGroups": false,
  "hdl-helper.workbench.heuristic.defaultHdlRole": "design"
}
```

### Preset C: Strict Classification Review Mode

```json
{
  "hdl-helper.workbench.roleGroupedSources": true,
  "hdl-helper.workbench.dualHierarchy": false,
  "hdl-helper.workbench.sources.showLegacyHierarchy": true,
  "hdl-helper.workbench.sources.showEmptyGroups": true,
  "hdl-helper.workbench.heuristic.defaultHdlRole": "unassigned"
}
```

### Preset D: Dual Hierarchy Verification Mode

```json
{
  "hdl-helper.workbench.roleGroupedSources": true,
  "hdl-helper.workbench.dualHierarchy": true,
  "hdl-helper.workbench.sources.showLegacyHierarchy": true,
  "hdl-helper.workbench.sources.showEmptyGroups": true,
  "hdl-helper.workbench.heuristic.defaultHdlRole": "design"
}
```
