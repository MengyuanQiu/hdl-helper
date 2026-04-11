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
- Command Palette: `HDL: Open Project Config`
- Quick Actions: `HDL: Quick Actions` -> `Open Project Config`
- Command Palette: `HDL: Open Last Waveform (Active Target)`
- Quick Actions: `HDL: Quick Actions` -> `Open Last Waveform (Active Target)`
- Command Palette: `HDL: Open Dual Hierarchy Regression Checklist`
- Quick Actions: `HDL: Quick Actions` -> `Open Dual Hierarchy Regression Checklist`

## Toolbar Optimization

- The hierarchy title bar is intentionally simplified to reduce icon noise.
- Use `HDL: Open Hierarchy Tools` (single tools icon) to access:
  - Workbench Settings
  - Simulation Settings
  - Workbench Settings Guide
  - Dual Hierarchy Regression Checklist
  - Debug Dual Hierarchy State
  - Debug Active Target Context
  - Debug Recent Runs By Target
  - Open Project Config
  - Open Last Waveform (Active Target)
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

- `hdl-helper.targetDrivenRuns.enabled`
  - Enable target-oriented run management.
  - When enabled, each simulation run stores the latest run result under a target key in workspace state.
  - Use `HDL: Debug Recent Runs By Target` to inspect current stored run records.
  - Use `HDL: Open Last Waveform (Active Target)` to reopen waveform by active target context.

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
