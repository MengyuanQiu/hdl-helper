# Semantic Workbench Release Checklist

Date: 2026-04-12
Scope: Iteration 6 governance gates

## 1) Semantic Workbench Gates

- [ ] `npm run compile` passes.
- [ ] `npm run lint` passes.
- [ ] `npm test` passes.
- [ ] `npm run check:project-config-integrity` passes.

## 2) Fixture Pass Matrix

Seeded baseline status (automated by `check:fixture-matrix`):

- [x] required fixture directories exist.
- [x] required fixture baseline artifacts exist.
- [x] heuristic-only fixture keeps no `.hdl-helper/project.json` contract.

Validate at least the following fixture projects:

- [ ] `pure_rtl_project`
- [ ] `rtl_tb_sva_project`
- [ ] `multi_top_project`
- [ ] `heuristic_only_project`
- [ ] `shared_file_project`
- [ ] `filelist_narrow_project`

For each fixture, verify:

- [ ] sources grouping
- [ ] hierarchy roots
- [ ] target context resolution
- [ ] run resolution
- [ ] diagnostics behavior

## 3) Debug Commands Sanity

- [ ] `HDL: Debug Current Project Classification`
- [ ] `HDL: Debug Active Target Context`
- [ ] `HDL: Debug Recent Runs By Target`
- [ ] `HDL: Debug Toolchain Health By Profile`

## 4) Fallback Mode Sanity

- [ ] Missing `.hdl-helper/project.json` enters heuristic compatibility mode.
- [ ] Invalid `activeTarget` reports warning and resolves fallback context.
- [ ] Missing target top appears as explicit diagnostics issue.
- [ ] Missing filelist is reported by project-config integrity gate.

## 5) Release Decision

- [ ] All checklist items above are complete.
- [ ] Open issues are triaged and assigned with owner/date.
- [ ] Release notes include semantic workbench gate status.
