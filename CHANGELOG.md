# Change Log

All notable changes to the HDL-Helper extension will be documented in this file.

Check Keep a Changelog for recommendations on how to structure this file.

## [3.2.0] - 2026-04-11

### Added
- **Simulation Entry Refactoring**: Migrated simulation entry from CodeLens to Module Hierarchy view
  - New commands: `HDL: Run Simulation (Hierarchy)` and `HDL: View Waveform (Hierarchy)`
  - Integrated simulation/waveform buttons in Module Hierarchy title bar and module rows
- **Multi-Workspace Support**: Enhanced workspace resolution with source document URI passthrough
  - Folder-scope configuration reading for independent workspace settings
  - Same-workspace module prioritization to reduce name collision
- **Simulation Features**:
  - Task selector for multiple tasks with same top module
  - Auto source file collection when sources/filelist not configured
  - Environment variable expansion in filelist ($VAR / ${VAR} / %VAR%)
  - Waveform fallback strategy (same-name priority, then latest in build dir)
  - Windows GBK encoding support for simulation output
- **Snippets System Refactoring**:
  - New namespace structure (sv/rtl/sva/constraints/uvm/templates)
  - Unified prefixes: `sv.*`, `rtl.*`, `sva.*`, `sdc.*`, `xdc.*`, `sta.*`, `uvm.*`, `tpl.rtl.*`
  - Templates layer with RV/FSM/CDC template sets
  - High-frequency basic snippets (reg.no_rst, rv.demux, counter, timer, etc.)
- **Documentation**: Merged hdl-helper-description.md into README.md, added PROJECT_REPORT_2026-04-11.md
- **Phase 0 Foundation**: Core types, StateService, fallback policy, and feature flags for workbench architecture

### Changed
- Removed simulation CodeLens from TB files (replaced by Module Hierarchy buttons)
- Snippets contribution paths switched from legacy to new directory structure
- Repository URL updated to https://github.com/MengyuanQiu/hdl-helper

### Fixed
- Multi-root workspace fixed root directory selection
- Prefix conflicts resolved (interface vs if)
- Duplicate snippet implementations consolidated
- Naming and description boundaries corrected

### Quality Metrics
- ESLint: 0 error / 0 warning
- TypeScript compilation: Passed
- Test suite: 1 passing (including filelist parsing test)
- Regression samples: Covers A1/A2/B1/B3 scenarios
- Snippets prefixes: 0 duplicates

## [Unreleased]

- Entered release-tail cleanup phase for snippet library stabilization.
- Added executable legacy governance document at snippets/LEGACY_POLICY.md.
- Planned removal of unmounted legacy snippet files after policy gate setup.
- Confirmed deliberate dual mapping of snippets/constraints/34_sta_reports_queries.json for both sdc and xdc workflows.
- Release sealed on 2026-04-11 after final validation (contribution path integrity, prefix uniqueness, JSON parse checks, and constraints/34 dual mapping).

## [Historical]

- Initial release