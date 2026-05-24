---
phase: 03-dynamic-input-editing
plan: 01
subsystem:
  dynamic-input-derivation
tags: [inputs, workflow, parsing, ordering, drafts, comfy, lora]
requires:
  - phase: 02-02
    provides: Active template persistence and restore flow
provides:
  - Workflow-derived typed input control catalog with deterministic ordering and Comfy primitive defaults
  - Browser-local draft persistence and global ordering overlay merge
  - Mounted dynamic editor UI with grouped rendering and warning surface
affects: [phase-3, phase-4, run-preparation]
tech-stack:
  added: []
  patterns: [meta-title-first parsing, primitive-default input typing, default-order-plus-overlay, black-box workflow editing, lora-row controls]
key-files:
  created: [src/shared/contracts/inputs.ts, src/shared/workflow/deriveInputControls.ts, src/client/lib/inputEditorStorage.ts, src/client/features/inputs/useDynamicInputEditor.ts, src/client/features/inputs/DynamicInputEditor.tsx, tests/shared/deriveInputControls.test.ts, tests/client/dynamicInputEditor.test.tsx]
  modified: [src/client/App.tsx]
key-decisions:
  - Parse only case-sensitive [Input#] titles and split category/name on first dot
  - Use _meta.title as default title source with inputs.title fallback
  - Treat Comfy Primitive value mapping as default control derivation behavior
  - Map Detailer.Loras lora_* entries as dedicated lora-row controls
  - Apply ordering as default derived order first, then sparse global overlay
  - Persist drafts per template fingerprint while keeping template defaults canonical
duration: 36min
completed: 2026-05-23
---

# Phase 3 Plan 01 Summary

Dynamic workflow input editing now derives a stable, typed control surface from canonical templates and persists per-template drafts without exposing workflow internals.

## Performance

- Duration: 36 min
- Tasks: 3
- Files modified: 8

## Accomplishments

- Added shared input contracts covering control kinds, warnings, drafts, ordering, and validation payload shapes.
- Implemented deterministic deriveInputControls parsing with strict [Input#] conventions, warning emission, stable ordering, and default `_meta.title` + Primitive-node mapping support.
- Added dedicated `Detailer.Loras` row controls with toggle and strength editing semantics.
- Added IndexedDB-backed editor draft and ordering overlay persistence plus orchestration hook behavior.
- Added and mounted DynamicInputEditor UI for text, multiline, numeric, boolean, dimension, and image control classes.
- Added parser/order and editor rendering regression tests.

## Verification Evidence

- Exists: All planned parser, contracts, storage, hook, UI, and test artifacts were created.
- Substantive: Derivation and ordering are implemented as executable logic with edge-case warning paths.
- Wired: App mounts DynamicInputEditor when an active template exists; hook connects derivation and storage.
- Functional:
  - npm test -- tests/shared/deriveInputControls.test.ts
  - npm test -- tests/client/dynamicInputEditor.test.tsx
  - npm run build

## Task Commits

1. Task 1: Create shared dynamic-input contracts and derivation pipeline - ff27a34 (feat)
2. Task 2: Implement browser-local draft and ordering overlay orchestration - dbb7c3d (feat)
3. Task 3: Build and mount dynamic input editor surface - 238ea93 (feat)

## Issues Encountered

None.
