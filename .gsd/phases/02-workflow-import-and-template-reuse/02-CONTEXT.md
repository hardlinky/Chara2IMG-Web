# Phase 2: Workflow Import and Template Reuse - Context

**Gathered:** 2026-05-23
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers workflow import and template reuse for ComfyUI JSON workflows:
- import a user-supplied workflow file,
- validate it at the phase-defined level,
- preserve the full original JSON unchanged,
- reuse the template across repeated runs in later sessions.

</domain>

<decisions>
## Implementation Decisions

### Validation Strictness

- Import acceptance rule: parseable JSON is sufficient to import.
- Workflow-shape correctness is not a hard import gate.
- Non-usable workflow shape should be handled as a later run-readiness check, not import rejection.

### Persistence Scope (V1)

- V1 storage is browser-local only.
- Template persistence should use local browser storage semantics for this phase.

### Reuse Model (V1)

- Reuse is single active template only.
- Importing a new template replaces the previously active template.

### Copilot's Discretion

- Exact UX wording and status labeling for "imported but not runnable yet" states.
- Internal validation split details between import-time parse checks and run-time readiness checks.

</decisions>

<specifics>
## Specific Ideas

- Reference sample workflow: external file provided by user at `D:\Slop\chara2img app\Chara2IMG2IMG - API.json`.
- The sample is a raw node-graph JSON keyed by node IDs (for example `"1"`, `"11"`), with `class_type`, `inputs`, and `_meta` fields, reinforcing full-fidelity JSON preservation.

</specifics>

<deferred>
## Deferred Ideas

- Add account-backed network storage for executed jobs and outputs so users can return to their history across devices/sessions.
- Keep a replaceable storage boundary in V1 so migration from browser-local persistence to network/account storage is straightforward in a future phase.

</deferred>

---

_Phase: 02-workflow-import-and-template-reuse_
_Context gathered: 2026-05-23_