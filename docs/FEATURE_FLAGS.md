# HDL Helper Workbench Feature Flags

**Version**: 1.0  
**Date**: 2026-04-11  
**Status**: Locked

## Overview

Feature flags control the rollout of workbench architecture features. All new workbench features are introduced additively with flags **off by default** to ensure stability and backward compatibility.

For user-facing UI configuration guidance (including non-flag workbench settings such as source patterns, empty-group visibility, and legacy section visibility), see `docs/WORKBENCH_SETTINGS_GUIDE.md`.

---

## Available Feature Flags

### 1. `hdl-helper.workbench.roleGroupedSources`

**Default**: `false`  
**Since**: Phase 0  
**Target Iteration**: Iteration 1 (V1-A)

#### Description
Enables role-grouped Sources view in HDL Explorer. When enabled, source files are organized into semantic groups:
- Design Sources
- Simulation Sources
- Verification Sources
- Constraints
- Scripts
- IP / Generated
- Unassigned / Other HDL Files

#### When Disabled
- Uses legacy flat file list or module-centric view
- All existing functionality preserved

#### When Enabled
- Sources section shows 6 role-based groups
- Files classified by heuristic rules (path, extension, naming)
- Unassigned files visible in dedicated section

#### Rollout Plan
1. **M0 (Phase 0)**: Flag added, default off
2. **M1 (After Iteration 1)**: Internal testing with flag on
3. **M2 (After Iteration 2)**: Enable by default for new users
4. **M3 (After Iteration 3)**: Enable by default for all users

---

### 2. `hdl-helper.workbench.dualHierarchy`

**Default**: `false`  
**Since**: Phase 0  
**Target Iteration**: Iteration 2 (V1-B)

#### Description
Enables independent Design Hierarchy and Simulation Hierarchy views. When enabled, hierarchy is split by semantic role instead of showing a single unified tree.

#### When Disabled
- Uses legacy single Module Hierarchy
- Single "Set as Top Module" command

#### When Enabled
- Hierarchy section shows two trees:
  - Design Hierarchy (from design top)
  - Simulation Hierarchy (from simulation top)
- Separate commands:
  - "Set as Design Top"
  - "Set as Simulation Top"
- Legacy "Set as Top Module" remains available and maps to Design/Simulation top based on module context.
- Each hierarchy built from scoped top context; hierarchy failures are isolated per section.

#### Dependencies
- Requires `roleGroupedSources` to be enabled
- Requires StateService with designTop/simulationTop

#### Rollout Plan
1. **M0 (Phase 0)**: Flag added, default off
2. **M1 (After Iteration 2)**: Internal testing with flag on
3. **M2 (After Iteration 3)**: Enable by default for new users
4. **M3 (After Iteration 4)**: Enable by default for all users

---

### 3. `hdl-helper.projectConfig.enabled`

**Default**: `false`  
**Since**: Phase 0  
**Target Iteration**: Iteration 3 (V2-A)

#### Description
Enables project.json configuration-driven project management. When enabled, the workbench reads `.hdl-helper/project.json` to determine source sets, targets, and tops.

#### When Disabled
- Uses heuristic classification only
- No project config validation
- No target-driven features

#### When Enabled
- Reads and validates `.hdl-helper/project.json`
- Classification follows truth priority:
  1. project.json source sets
  2. target-local overrides
  3. filelist references
  4. heuristic fallback
- Project section shows config status
- Diagnostics panel shows config issues
- Commands available:
  - "Create Project Config"
  - "Validate Project Config"
  - "Generate Project Config from Workspace"

#### Fallback Behavior
- Missing config: heuristic mode (info message)
- Invalid config: diagnostics + read-only fallback (error message)

#### Rollout Plan
1. **M0 (Phase 0)**: Flag added, default off
2. **M2 (After Iteration 3)**: Internal testing with flag on
3. **M3 (After Iteration 4)**: Enable by default for new projects
4. **M4 (After Iteration 5)**: Enable by default for all users

---

### 4. `hdl-helper.targetDrivenRuns.enabled`

**Default**: `false`  
**Since**: Phase 0  
**Target Iteration**: Iteration 4 (V2-B)

#### Description
Enables target-driven simulation run management. When enabled, simulation tasks and runs are associated with the active target context.

#### When Disabled
- Uses legacy task resolution
- Runs not associated with targets
- Single recent run/waveform per workspace

#### When Enabled
- Tasks resolved via TargetContextService
- Runs stored per target
- Tasks & Runs section shows:
  - Simulation Tasks (for active target)
  - Recent Runs (by target)
  - Last Waveform (by target)
  - Last Logs (by target)
- Commands support target context:
  - "Run Simulation" uses active target
  - "View Waveform" finds target-specific waveform

#### Dependencies
- Requires `projectConfig.enabled` to be enabled
- Requires TargetContextService

#### Rollout Plan
1. **M0 (Phase 0)**: Flag added, default off
2. **M2 (After Iteration 4)**: Internal testing with flag on
3. **M3 (After Iteration 5)**: Enable by default for new projects
4. **M4 (After Iteration 6)**: Enable by default for all users

---

## Feature Flag Dependencies

```
roleGroupedSources (base)
    ↓
dualHierarchy (depends on roleGroupedSources)
    ↓
projectConfig (depends on roleGroupedSources)
    ↓
targetDrivenRuns (depends on projectConfig)
```

**Rule**: A feature flag cannot be enabled if its dependencies are disabled.

---

## Rollout Strategy

### Phase 1: Additive Introduction (Default Off)
- All flags start as `false`
- Features developed behind flags
- Internal testing only
- No impact on existing users

### Phase 2: Opt-in Testing (Default Off, Documented)
- Features documented in README
- Users can opt-in via settings
- Feedback collected
- Bugs fixed before default-on

### Phase 3: Default On for New Users
- New installations have flags on by default
- Existing users keep flags off (preserved in workspace settings)
- Migration guide provided

### Phase 4: Default On for All Users
- Flags enabled by default globally
- Legacy mode still accessible by explicitly setting flags to false
- Deprecation notice for legacy mode

### Phase 5: Flag Removal (Future)
- After 2+ stable releases with flags on
- Legacy code paths removed
- Flags removed from settings schema

---

## Testing Requirements

### Per-Flag Testing
Each flag must have:
1. **Unit tests**: Flag on vs off behavior
2. **Integration tests**: Flag combinations
3. **Manual tests**: UI rendering with flag states
4. **Regression tests**: Existing features unaffected when flag off

### Flag Combination Matrix
Test critical combinations:
- All off (baseline)
- roleGroupedSources only
- roleGroupedSources + dualHierarchy
- roleGroupedSources + projectConfig
- All on (full workbench)

---

## Configuration Examples

### Conservative User (All Off)
```json
{
  "hdl-helper.workbench.roleGroupedSources": false,
  "hdl-helper.workbench.dualHierarchy": false,
  "hdl-helper.projectConfig.enabled": false,
  "hdl-helper.targetDrivenRuns.enabled": false
}
```

### Early Adopter (Iteration 1-2 Features)
```json
{
  "hdl-helper.workbench.roleGroupedSources": true,
  "hdl-helper.workbench.dualHierarchy": true,
  "hdl-helper.projectConfig.enabled": false,
  "hdl-helper.targetDrivenRuns.enabled": false
}
```

### Full Workbench (All Features)
```json
{
  "hdl-helper.workbench.roleGroupedSources": true,
  "hdl-helper.workbench.dualHierarchy": true,
  "hdl-helper.projectConfig.enabled": true,
  "hdl-helper.targetDrivenRuns.enabled": true
}
```

---

## Monitoring and Metrics

### Telemetry (Optional, Opt-in)
Track flag adoption:
- Flag enabled/disabled counts
- Feature usage when flag enabled
- Error rates by flag state

### User Feedback Channels
- GitHub issues tagged with `feature-flag:<name>`
- User surveys after milestone releases
- Internal dogfooding reports

---

## Version History

- **1.0** (2026-04-11): Initial locked version for Phase 0
