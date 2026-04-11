# HDL Helper Workbench Fallback Policy

**Version**: 1.0  
**Date**: 2026-04-11  
**Status**: Locked

## Overview

This document defines the failure and degradation policy for HDL Helper workbench architecture. All fallback behaviors must be explicit, observable, and non-silent.

## Core Principle

**No silent failures. All degradation must be visible and actionable.**

When the workbench encounters configuration issues or missing data, it must:
1. Emit explicit diagnostics
2. Provide clear fallback behavior
3. Allow users to continue working in degraded mode
4. Never silently mask errors with implicit overrides

---

## Case A: `.hdl-helper/project.json` Missing

### Behavior
- Enter **heuristic compatibility mode**
- Show non-blocking info status in Project section
- Continue using legacy file classification

### UI Indicators
- Project section shows: "No project config (using heuristic mode)"
- Info icon with tooltip: "Create project.json for better organization"
- Quick action: "Create Project Config"

### Functional Impact
- Sources grouped by heuristic path/extension rules
- Single hierarchy (legacy behavior)
- No target-driven runs
- All existing commands continue to work

### User Actions
- Continue working normally
- Optionally run "HDL: Create Project Config" to upgrade

---

## Case B: `.hdl-helper/project.json` Exists but Invalid

### Behavior
- Emit diagnostics with explicit config errors
- Project section shows **config invalid state**
- Allow read-only heuristic browsing fallback
- **Do not silently mask config errors**

### UI Indicators
- Project section shows: "Project config invalid (see diagnostics)"
- Error icon with tooltip: "Click to view config issues"
- Diagnostics panel shows specific errors:
  - Parse errors (JSON syntax)
  - Schema validation errors
  - Missing source set references
  - Invalid target definitions

### Functional Impact
- Sources fall back to heuristic grouping (read-only)
- Hierarchy falls back to legacy single-tree mode
- Target-driven features disabled
- Config-dependent commands show error messages

### User Actions
- Fix config errors shown in diagnostics
- Run "HDL: Validate Project Config" for detailed report
- Temporarily continue with heuristic fallback

---

## Case C: `activeTarget` is Invalid

### Behavior
- Emit diagnostics with invalid target id
- Fallback to first valid target
- If no valid targets, fallback to tops default by kind

### Fallback Priority
1. First valid target in `targets` map
2. If kind is `simulation`: use `tops.simulation` + simulation sources
3. If kind is `design`: use `tops.design` + design sources
4. If all fail: show error and disable target-driven features

### UI Indicators
- Project section shows: "Active target invalid (using fallback)"
- Warning icon with tooltip: "Target 'xyz' not found, using 'abc'"
- Quick action: "Select Target"

### Functional Impact
- Target context resolves to fallback target
- Hierarchy builds from fallback context
- Runs use fallback target settings

### User Actions
- Run "HDL: Select Active Target" to choose valid target
- Fix target reference in project.json

---

## Case D: Top Resolution or Hierarchy Build Fails

### Behavior
- Hierarchy section shows explicit error state
- Sources, Tasks/Runs, and Diagnostics remain available
- Error does not propagate to other sections

### UI Indicators
- Hierarchy section shows: "Failed to build hierarchy"
- Error icon with details:
  - "Top module 'xyz' not found"
  - "Circular dependency detected"
  - "Parse error in module 'abc'"
- Quick action: "Set Top Module"

### Functional Impact
- Hierarchy section empty or shows error placeholder
- Sources section continues to work
- Tasks/Runs section continues to work
- File navigation and editing unaffected

### User Actions
- Verify top module exists and is spelled correctly
- Check for syntax errors in top module file
- Run "HDL: Set as Design Top" or "HDL: Set as Simulation Top"
- Run "HDL: Debug Project" to inspect module index

---

## Diagnostic Severity Levels

### Error (Red)
- Config parse failure
- Invalid target reference
- Missing required fields
- Circular dependencies

### Warning (Yellow)
- Active target not found (fallback used)
- Top module not found (hierarchy disabled)
- Source set references missing files
- Toolchain tools not found

### Info (Blue)
- No project config (heuristic mode)
- Using fallback target
- Using default settings

---

## Fallback Mode Feature Matrix

| Feature | No Config | Invalid Config | Invalid Target | Hierarchy Fail |
|---------|-----------|----------------|----------------|----------------|
| Sources Grouping | Heuristic | Heuristic | Config | Config |
| Hierarchy | Legacy Single | Legacy Single | Fallback Target | Error State |
| Target Context | N/A | N/A | Fallback | Current |
| Tasks/Runs | Legacy | Legacy | Fallback Target | Current |
| Diagnostics | Available | Available | Available | Available |
| File Editing | Available | Available | Available | Available |
| Commands | All Work | All Work | Most Work | All Work |

---

## Implementation Requirements

### For Service Layer
1. All services must return explicit error types, not throw exceptions
2. Services must not silently fall back without emitting diagnostics
3. Fallback logic must be centralized in dedicated fallback resolver

### For UI Layer
1. TreeProvider must render error states explicitly
2. Status bar must show degraded mode indicators
3. Quick actions must be available for recovery

### For Diagnostics
1. All config errors must appear in Diagnostics panel
2. Diagnostics must include actionable fix suggestions
3. Diagnostics must link to relevant documentation

---

## Testing Requirements

Each fallback case must have:
1. Unit test for detection logic
2. Integration test for fallback behavior
3. Manual test for UI indicators
4. Regression test to prevent silent failures

---

## Version History

- **1.0** (2026-04-11): Initial locked version for Phase 0
