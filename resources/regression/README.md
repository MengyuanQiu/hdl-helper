# Regression Fixtures

This directory contains governance and semantic workbench regression assets.

Fixture matrix root:
- `resources/regression/fixtures`

Seeded fixture projects:
- `pure_rtl_project`
- `rtl_tb_sva_project`
- `multi_top_project`
- `heuristic_only_project`
- `shared_file_project`
- `filelist_narrow_project`

Automated checks:
- `npm run check:fixture-matrix` validates fixture directories, README checklist tokens, and required baseline artifacts.
- `npm run check:fixture-sanity` runs first-pass sanity over all seeded fixtures and writes `FIXTURE_SANITY_REPORT_2026-04-12.md`.
- `npm run check:debug-commands-sanity` validates debug command contribution/registration/test evidence and writes `DEBUG_COMMANDS_SANITY_REPORT_2026-04-12.md`.
- `npm run check:fixture-validation` validates fixture checklist dimensions and writes `FIXTURE_VALIDATION_REPORT_2026-04-12.md`.
- `npm run check:semantic-workbench-signoff` validates final release evidence and writes `SEMANTIC_WORKBENCH_SIGNOFF_2026-04-12.md`.
