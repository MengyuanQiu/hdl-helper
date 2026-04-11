# Dual Hierarchy Manual Regression (Iteration 2)

Date: 2026-04-11
Scope: Minimal script-like checks for dual hierarchy behavior and command mapping.

## Preconditions

1. Enable settings:
   - hdl-helper.workbench.roleGroupedSources = true
   - hdl-helper.workbench.dualHierarchy = true
2. Run command: HDL: Refresh Project
3. Open view: Module Hierarchy

## Script A: Root Structure

1. Confirm roots include:
   - Sources
   - Design Hierarchy
   - Simulation Hierarchy
2. Toggle hdl-helper.workbench.dualHierarchy = false
3. Confirm roots change to:
   - Sources
   - Module Hierarchy (Legacy) (if showLegacyHierarchy = true)

Expected: Root structure switches deterministically with dualHierarchy flag.

## Script B: Top Independence

1. Right-click a design module and run: HDL: Set as Design Top
2. Right-click a testbench module and run: HDL: Set as Simulation Top
3. Expand Design Hierarchy and Simulation Hierarchy
4. Change Simulation Top to another testbench

Expected:
- Design Hierarchy root remains unchanged.
- Simulation Hierarchy root updates to the selected module.

## Script C: Legacy Mapping Compatibility

1. Right-click a design module and run: HDL: Set as Top Module
2. Run command: HDL: Debug Dual Hierarchy State
3. Right-click a testbench module and run: HDL: Set as Top Module
4. Run command: HDL: Debug Dual Hierarchy State

Expected:
- Design-like module maps to designTop.
- Testbench-like module maps to simulationTop.
- Output channel shows updated top values.

## Script D: Clear and Fallback

1. Run command: HDL: Clear Top Module
2. Run command: HDL: Debug Dual Hierarchy State

Expected:
- designTop and simulationTop become unset.
- Hierarchy roots fallback to inferred candidates.

## Script E: Scope Isolation

1. Open project where some helper modules are outside design/simulation source role scope.
2. Set a top module that is outside current scope.
3. Expand corresponding hierarchy.

Expected:
- View shows warning item for out-of-scoped top.
- Other hierarchy section remains usable.

## Fast Diagnostic Command List

- HDL: Refresh Project
- HDL: Set as Design Top
- HDL: Set as Simulation Top
- HDL: Set as Top Module
- HDL: Clear Top Module
- HDL: Debug Dual Hierarchy State
