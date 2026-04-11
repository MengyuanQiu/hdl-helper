# HDL Helper Workbench Settings Guide

**Date**: 2026-04-11

## Goal

This guide lists workbench-related settings that can be configured directly in VS Code Settings UI, so users do not need to edit source code to adjust explorer behavior.

## How To Open Settings UI

1. Run command: `Preferences: Open Settings (UI)`
2. Search keyword: `HDL Helper`
3. Adjust settings under `HDL Helper` section

## Core Workbench Toggles

- `hdl-helper.workbench.roleGroupedSources`
  - Enable role-grouped Sources view in HDL Explorer.
  - `false`: legacy view behavior
  - `true`: show semantic source groups

- `hdl-helper.workbench.dualHierarchy`
  - Enable split Design/Simulation hierarchy mode (future-facing toggle).

- `hdl-helper.projectConfig.enabled`
  - Enable project.json-driven classification and context.

- `hdl-helper.targetDrivenRuns.enabled`
  - Enable target-oriented run management.

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
  "hdl-helper.workbench.sources.showEmptyGroups": true,
  "hdl-helper.workbench.heuristic.defaultHdlRole": "design"
}
```

### Preset B: Compact Sources-first Mode

```json
{
  "hdl-helper.workbench.roleGroupedSources": true,
  "hdl-helper.workbench.sources.showLegacyHierarchy": false,
  "hdl-helper.workbench.sources.showEmptyGroups": false,
  "hdl-helper.workbench.heuristic.defaultHdlRole": "design"
}
```

### Preset C: Strict Classification Review Mode

```json
{
  "hdl-helper.workbench.roleGroupedSources": true,
  "hdl-helper.workbench.sources.showLegacyHierarchy": true,
  "hdl-helper.workbench.sources.showEmptyGroups": true,
  "hdl-helper.workbench.heuristic.defaultHdlRole": "unassigned"
}
```
