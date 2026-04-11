# HDL Helper Upgrade Iteration Plan v2

Date: 2026-04-11
Owner: HDL Helper Core Team
Status: Execution-ready

## 1. Product Positioning

Upgrade objective is no longer "a stronger explorer" but a project-semantic workbench.

Primary outcomes:

- Organize by engineering role instead of flat scan outputs.
- Make active target the semantic center for hierarchy, runs, and diagnostics.
- Introduce explicit project boundaries and reusable source/file sets.
- Keep backward compatibility via heuristic mode.

## 2. Non-goals (Locked)

The first major wave will not include:

- Full Vivado Project Manager parity.
- A full graphical target editor.
- Cross-workspace dependency graph.
- DB-grade persistent index server.
- Full generator refactor to target-aware execution.

## 3. Target Workbench Information Architecture

HDL Explorer target structure:

- Project
- Sources
  - Design Sources
  - Simulation Sources
  - Verification Sources
  - Constraints
  - Scripts
  - IP / Generated
- Hierarchy
  - Design Hierarchy
  - Simulation Hierarchy
- Tasks and Runs
- Diagnostics
- Assets

View modes (phase 2+):

- Files View
- Hierarchy View
- Workspace View

## 4. Canonical Source of Truth

Truth priority is fixed as:

1. project.json explicit sourceSets and target definitions
2. target-local overrides
3. filelist and task reference graph
4. heuristic classification (fallback only)

Rules:

- UI grouping defaults to project config if present.
- Hierarchy defaults to active target resolved context.
- Run resolution defaults to active target context.
- Heuristics are compatibility fallback when config is absent.

## 4.1 Failure and Degradation Policy (Locked)

Case A: `.hdl-helper/project.json` missing
- Enter heuristic compatibility mode.
- Show non-blocking info status in Project section.

Case B: `.hdl-helper/project.json` exists but parse/validation fails
- Emit diagnostics with explicit config errors.
- Project section shows config invalid state.
- Allow read-only heuristic browsing fallback.
- Do not silently mask config errors via implicit overrides.

Case C: activeTarget is invalid
- Emit diagnostics with invalid target id.
- Fallback to first valid target; if none, fallback to tops default by kind.

Case D: top resolution or hierarchy build fails
- Hierarchy section shows explicit error state.
- Sources, Tasks/Runs, and Diagnostics remain available.

## 5. Core Domain Model

Core entities:

1. SourceSet
- design
- simulation
- verification
- constraints
- scripts
- ip
- generated

2. Target
- kind: design | simulation | synthesis | implementation
- top
- sourceSets[]
- optional constraints/scripts/filelist/toolProfile/defines/includeDirs

3. FileClassificationResult
- physicalType
- rolePrimary
- roleSecondary[]
- inActiveTarget
- sourceOfTruth

4. TargetContext (effective)
- target id and kind
- resolved top
- resolved file list
- resolved includeDirs and defines
- resolved constraints and scripts
- resolved tool profile

## 5.1 Editable Boundary (Config Layer vs Derived Layer)

User-editable configuration layer:

- sourceSets path patterns
- tops
- targets
- activeTarget
- filelists
- toolProfiles

System-derived (non-canonical) layer:

- roleSecondary
- classification details
- resolved files and effective context snapshots

Rule:

- Derived layer must never be treated as source of truth.
- Derived layer is inspectable/debuggable, not manually authored by default.

## 6. State Model (Must-have)

The workbench state is standardized as:

- activeProject
- activeTarget
- designTop
- simulationTop
- projectConfigStatus
- indexStatus
- lastRunByTarget
- toolchainStatusByProfile

Constraint:

- State changes must flow through a unified state service, not directly in tree provider.

## 7. Override Model

When classification is wrong, user override is supported in two layers:

1. Persistent override
- written to .hdl-helper/project.json

2. Session override
- written to workspace memento

Priority:

- persistent override > session override > default classification

UX policy:

- "Reclassify as..." prompts user to choose session-only or persist-to-project.

## 8. Shared and Unassigned File Policy

Shared file policy:

- A file may be referenced by multiple source sets.
- UI renders the file once under primary role.
- Secondary references are shown as "Referenced by" metadata.
- No physical duplication.

Unassigned file policy:

- Files not in any source set appear under Unassigned / Other HDL Files.
- Hidden only when user explicitly filters them out.

## 9. Technical Layering Constraints

Hard architecture constraints:

- TreeProvider renders only; it does not decide classification or resolution.
- TargetContext is the single semantic entry for hierarchy, runs, and diagnostics.

Mandatory service split:

1. ProjectConfigService
2. ClassificationService
3. SourceSetService
4. TargetContextService
5. HierarchyService
6. RunsService / TaskContextService
7. ExplorerViewModelBuilder
8. TreeProvider (render only)

Pipeline mode for first implementation:

- deterministic snapshot rebuild (config/file changes/debounce/manual refresh)
- do not implement complex incremental graph updates in V1

## 10. Feature Flags and Rollout

Feature flags:

- hdl-helper.workbench.roleGroupedSources
- hdl-helper.workbench.dualHierarchy
- hdl-helper.projectConfig.enabled
- hdl-helper.targetDrivenRuns.enabled

Rollout:

1. Additive introduction with flags off by default (internal testing).
2. Enable role grouping and dual hierarchy after M1 stabilization.
3. Enable project config and target-driven runs after M2 validation.

## 11. Iteration Roadmap

## Iteration 1 (V1-A): Role-grouped Sources UI Foundation

Objective:
- Replace mixed flat source list with role groups.

Key work:
- Add source role sections.
- Implement fallback heuristic classifier.
- Keep legacy hierarchy path as fallback.

Acceptance:
- 6 source role groups visible and interactive.
- No command regression.

## Iteration 2 (V1-B): Dual Hierarchy (Design and Simulation)

Objective:
- Split hierarchy by semantic role.

Key work:
- Separate design top and simulation top state.
- Build hierarchy from scoped source context.

Acceptance:
- Design hierarchy and simulation hierarchy independently valid.

## Iteration 3 (V2-A): Minimal project.json and Config Diagnostics

Objective:
- Introduce explicit project boundary and source sets.

Key work:
- Parse and validate .hdl-helper/project.json.
- Config diagnostics and fallback mode.
- Command: create project config.

Acceptance:
- Config drives classification when present.
- Missing config still uses heuristic mode.

## Iteration 4 (V2-B): Target-driven Runs and Tasks

Objective:
- Bind runs to active target context.

Key work:
- Resolve runs via TargetContextService.
- Store recent runs by target.
- Expose Tasks and Runs section.

Acceptance:
- Run and reopen waveform/log by active target.

## Iteration 5 (V3-A): First-class SourceSet and FileSet Engine

Objective:
- Make source sets executable semantic units.

Key work:
- Formal source set resolution API.
- Shared file representation with primary and secondary roles.

Acceptance:
- Deterministic per-target resolved file list.

## Iteration 5.5 (V3-A+): Project Bootstrap and Inspector

Objective:
- Improve adoption and debuggability.

Key work:
- Command: generate project config from workspace.
- Add inspector panel/details for file/target/sourceOfTruth.

Acceptance:
- One-click bootstrap for new project.
- Classification and target context are inspectable.

## Iteration 6 (V3-B): Diagnostics and Governance Hardening

Objective:
- Make model observable and release-safe.

Key work:
- Project config issues group.
- Toolchain health per profile.
- CI gates for target and source-set integrity.

Acceptance:
- Misconfigurations are explicit and actionable.
- Release checklist includes semantic-workbench gates.

## 12. Target Resolution Rules (Locked)

For each target, effective context is computed from:

- top
- sourceSets
- resolved files
- includeDirs
- defines
- constraints
- scripts
- filelist
- toolProfile

Override rules:

- target-local values override project-global defaults
- filelist policy by target kind:
  - simulation target: filelist is default compile boundary (narrow-first); augmentation is explicit only
  - design/synthesis/implementation target: if filelist is explicitly configured, resolve primarily from filelist; sourceSets remain canonical for grouping and browsing
- when target top is absent, fallback to tops.design or tops.simulation by kind

## 12.1 Event Trigger Matrix

| Trigger | Rebuild Scope |
| --- | --- |
| `project.json` changed | full project snapshot |
| `activeTarget` changed | target context + hierarchy + tasks/runs |
| HDL file added/removed | classification + source sets + hierarchy |
| HDL file renamed | classification + hierarchy + definition index |
| task file changed | tasks/runs (+ target context if referenced) |
| manual refresh | full rebuild |

## 13. Regression Strategy and Fixtures

Must-have checks per iteration:

- compile and lint pass
- no regression on core commands
- tree rendering and interaction sanity

Mandatory fixture matrix:

- pure rtl project
- rtl + tb + sva project
- multi-top project
- no project config (heuristic mode)
- shared file between design and simulation
- filelist-narrowed target project

Recommended:

- snapshot tests for grouped sections and hierarchy roots
- debug commands
  - HDL: Debug Current Project Classification
  - HDL: Debug Active Target Context

## 14. Milestones

M1 (after Iteration 2):
- Role-grouped sources and dual hierarchy stable.

M2 (after Iteration 4):
- project.json and target-driven runs production-usable.

M3 (after Iteration 6):
- FileSet engine and governance stabilized for long-term evolution.

## 15. Immediate Next Actions (This Week)

1. Create service skeletons: ProjectConfigService, ClassificationService, TargetContextService.
2. Define normalized internal types and state model contracts.
3. Implement Iteration 1 explorer grouping with feature flag.
4. Add first fixture set and manual regression checklist.

## 15.1 Week-1 Execution Cadence

Day 1:
- internal types and state contracts
- service skeletons

Day 2:
- minimal ClassificationService
- minimal TargetContextService
- debug command outputs

Day 3:
- ExplorerViewModelBuilder
- Sources role-group rendering

Day 4:
- heuristic compatibility wiring
- feature flags
- first fixture run

Day 5:
- regression checklist hardening
- architecture review gate for Iteration 2 entry

---

This v2 plan is execution-focused and constrained by architecture rules to reduce rework, preserve compatibility, and establish a durable project-semantic foundation.
