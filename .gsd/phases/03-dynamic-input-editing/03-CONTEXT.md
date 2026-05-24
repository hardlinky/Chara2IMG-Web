# Phase 3: Dynamic Input Editing - Context

**Gathered:** 2026-05-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 delivers a user-friendly input editing surface derived from workflow-defined input nodes, then validates and applies those edits into a job-ready workflow payload at run time without exposing workflow internals to users.

</domain>

<decisions>
## Implementation Decisions

### Input Surface Structure

- Parse editable controls from node titles using exact prefix format `[Input#]`.
- Use `_meta.title` as the default title source, with `inputs.title` as fallback when `_meta.title` is missing.
- Parse title body using first-dot split: `Category.Name`.
- Example: `[Input1] Character.Body` -> category `Character`, input name `Body`.
- Example: `[Input#] Character.Face.Eyes` -> category `Character`, input name `Face.Eyes`.
- Display only input nodes in the editing UI; hide non-input workflow graph details.
- Workflow acts as a black-box template for users.
- Default ordering uses `[Input#]` index ascending, then full title tie-break for duplicates.
- Duplicates are allowed and ordered by full title.
- Numbering gaps are allowed.
- Case-sensitive parsing for titles and prefix matching (`[Input#]` exact only).
- Trim leading/trailing whitespace on parsed category and name.
- Category and input titles are case-sensitive for grouping and display.
- Multilingual names are supported.
- Allowed naming chars: Unicode letters/numbers, spaces, and simple separators (`-`, `_`, `(`, `)`).
- Allowed naming chars include `?` for existing workflow compatibility.
- If disallowed symbols appear, exclude from UI and add a non-blocking warning.
- If title cannot cleanly parse into `Category.Name`, include in `Uncategorized` using remaining title text.
- If mapped input node has no editable value field, exclude from UI and add a non-blocking warning.
- Unknown/unsupported declared types are hidden from editor and listed in warnings.
- Source mapping display is hidden by default with user toggle.
- Reordering is for presentation convenience only and must never alter workflow structure or functionality.
- Reorder scope includes both section-level and control-level movement.
- Saved custom ordering is global across workflows.
- Runtime ordering model: compute default order first, then apply user-reorder overlay.
- New inputs introduced later are inserted by default order, then user ordering overlay is applied.
- Stale saved-order entries are ignored silently.

### Control Mapping Rules

- Control types are dictated by workflow node declared types/metadata, not by value-shape heuristics.
- For Comfy primitive nodes, default mapping from `inputs.value` is first-class behavior:
  - `PrimitiveString` -> `text`
  - `PrimitiveStringMultiline` -> `multiline`
  - `PrimitiveBoolean` -> `boolean`
  - `PrimitiveInt` / `PrimitiveFloat` -> `number`
- No smart coercion from string-like values to numeric/boolean by inference.
- Constraints come strictly from workflow metadata.
- Image controls use file picker plus preview, with replace/remove actions.
- `Detailer.Loras` mapping is a dedicated control shape:
  - one control per `lora_*` row
  - checkbox toggle bound to `on`
  - lora name shown as label
  - strength slider with range `[-5.0, 5.0]`
  - strength textbox mirroring/editing the same float value

### Editing Behavior and Validation

- Validation model is hybrid:
  - Non-blocking inline checks while editing.
  - Full blocking validation on Run.
- Inline invalid state must not block editing/navigation.
- On failed Run validation:
  - Do not start run.
  - Highlight all invalid fields.
  - Keep all user edits in place so they can fix only failing fields.
- No dedicated invalid-field jump controls; rely on highlights and normal scrolling.
- Separate global status messaging for unsaved changes vs invalid state.
- Unsaved changes are defined as diff from last successful Run snapshot.
- Successful Run clears validation-error state.
- Inline field errors disappear immediately once field becomes locally valid.
- Validation/error copy should be plain-language and user-facing only (no workflow internals exposed).
- Multiline validation runs at whole-field level.
- Boolean edits are pending until Run (same model as other controls).
- Image removal can create temporary invalid state; Run blocks when required image is missing.

### Draft and Reset Behavior

- Auto-save drafts continuously in browser.
- Loading a template resets inputs to values from that template.
- Draft state must not override freshly loaded template values.
- Invalid draft persistence rule:
  - Text-like fields may persist invalid drafts.
  - Structured fields should not persist invalid drafts.
- Provide a "Reset to template defaults" action.
- Show reset action only when current values differ from template defaults.

### Apply-Back and Payload Integrity

- No separate Apply action; full validation and apply-back occur as part of Run.
- On Run, build a fresh payload each time from template + current inputs.
- Template remains canonical and unmutated.
- Payload build is all-or-nothing:
  - If any required input write-back fails, treat as blocking invalid state.
  - Do not send run request.
- History/share model is lean:
  - Keep base workflow + input snapshot.
  - Do not persist exact built payload as historical artifact.
- Cross-workflow input loading behavior (Input A onto Workflow B):
  - Start from Workflow B defaults.
  - Overlay mapped compatible values from Input A.
  - Keep unmapped fields at Workflow B defaults.
  - Maintain inline and full Run validation guarantees.

### Copilot's Discretion

- Visual layout: moderate discretion; clean modern UI is acceptable if behavior rules remain exact.
- Technical architecture: balanced choices (simple now, avoid dead ends for later phases).
- UX copy: Copilot may draft autonomously; keep easy to revise later.
- Sequencing discretion: prioritize correctness path first (mapping/validation/payload integrity and successful image generation), then QoL/polish.

</decisions>

<specifics>
## Specific Ideas

- Use ordering convention compatibility from the prior Chara2Img implementation and the provided working workflow example as behavioral reference points for parser/order parity.

</specifics>

<deferred>
## Deferred Ideas

- Sharing successful runs as base workflow + inputs (reconstructable elsewhere) is noted and may be expanded in later phases concerned with run history/export UX.

</deferred>

---

_Phase: 03-dynamic-input-editing_
_Context gathered: 2026-05-23_
