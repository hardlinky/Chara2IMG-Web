# Phase 3: Dynamic Input Editing - Research

**Researched:** 2026-05-23
**Domain:** Workflow-derived input surface, draft persistence, and apply-back payload integrity for ComfyUI templates
**Confidence:** MEDIUM-HIGH

## Summary

Phase 3 should be planned as a deterministic transformation pipeline, not just a form UI task. The workflow template remains canonical; the editor is a derived projection of supported `[Input#]` nodes; and every Run builds a fresh payload from canonical template + current draft values. This matches the locked decisions (black-box workflow, no separate Apply action, all-or-nothing write-back on Run) and keeps INPT-01..INPT-08 testable.

The existing stack already supports this plan without introducing major new dependencies: React 19 for editor state and rendering, Zod 4 for runtime validation and user-facing error mapping, and Dexie/IndexedDB for durable browser drafts and ordering overlays. The implementation should add phase-specific contracts in shared modules first (parser, control definitions, run-time validator, apply-back builder), then wire UI on top. This sequence reduces regressions and allows fixture-first verification of parser/order parity before UX polish.

The highest planning risk is convention drift around `[Input#] Category.Name` parsing and control typing. The phase context intentionally locks these rules, so planning should codify them as executable fixtures (including duplicates, gaps, Unicode names, invalid symbols, and missing editable fields) before building the final editor UI.

**Primary recommendation:** implement a pure, fixture-tested `deriveControls -> validateDraft -> buildRunPayload` pipeline and treat UI as a consumer of that pipeline, not the owner of business rules.

## Standard Stack

Use the existing repository stack and browser APIs. Do not add an alternate form framework in this phase.

### Core

| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| React | 19.x | Render dynamic controls, local draft editing, run-time invalid highlighting | Already the app foundation; supports controlled form state and composable feature hooks. |
| TypeScript | 5.8+ | Strongly typed control definitions, draft models, and apply-back contracts | Needed to keep parser, validator, UI, and payload builder aligned. |
| Zod | 4.x | Runtime validation for derived controls, run-time payload preflight, and clear error conversion | Already in repo; `safeParse` + flatten/tree formatting supports user-facing validation output. |
| Dexie | 4.4.x | Browser-local persistence for draft inputs and global reorder overlays | Already in repo and aligned with Phase 2 template persistence patterns. |

### Supporting

| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| IndexedDB (via Dexie) | Browser standard | Durable local storage for drafts/reset baseline/order overlay | Use for auto-save and restore across sessions. |
| FileReader / URL APIs | Browser standard | Image input preview, replace/remove UX | Use for INPT-06 image picker + preview flows. |
| Runpod queue request shape | Current docs | Run request envelope (`{ input: ... }`) | Use when constructing final run payload body. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| ---------- | --------- | -------- |
| React controlled state + feature hooks | Dedicated form library | Adds complexity and adaptation cost for dynamic nested controls and custom apply-back semantics. |
| Zod + explicit control metadata | Value-shape inference/coercion | Violates locked decision: no smart coercion; types must come from workflow metadata. |
| Dexie draft store | `localStorage` blobs | Harder schema evolution and weaker data handling for structured drafts and reorder overlays. |

**Installation:**
```bash
# No additional dependency required for the baseline plan.
# Existing deps already include react, zod, and dexie.
npm install
```

## Architecture Patterns

### Recommended Project Structure

```text
src/
├── shared/
│   ├── contracts/
│   │   └── inputs.ts                 # Control, warning, validation, apply-back contracts
│   └── workflow/
│       ├── deriveInputControls.ts    # [Input#] parser + ordering + warning emission
│       ├── validateInputDraft.ts     # Inline + run-time blocking validation
│       └── buildRunWorkflowPayload.ts# Canonical-template clone + write-back
├── client/
│   ├── features/
│   │   └── inputs/
│   │       ├── DynamicInputEditor.tsx
│   │       ├── InputSection.tsx
│   │       ├── InputControlField.tsx
│   │       └── useInputDraft.ts
│   └── lib/
│       ├── inputDraftStorage.ts      # Dexie table for drafts + overlays
│       └── inputOrderingStorage.ts   # Global reorder overlay persistence
└── tests/
    ├── shared/
    │   ├── deriveInputControls.test.ts
    │   ├── validateInputDraft.test.ts
    │   └── buildRunWorkflowPayload.test.ts
    └── client/
        └── dynamicInputEditor.test.ts
```

### Pattern 1: Deterministic Derivation Pipeline

**What:** Convert canonical workflow template into a stable control catalog using locked title conventions and metadata-driven typing.
**When to use:** On template load and when switching templates.
**Example:**
```typescript
// Source: phase locked decisions + existing workflow template model
const catalog = deriveInputControls(template.rawJson, {
  inputPrefixPattern: /^\[Input(\d+)\]\s*/,
  firstDotSplit: true,
  fallbackCategory: "Uncategorized",
  caseSensitive: true
});
```

### Pattern 2: Two-Tier Validation Model

**What:** Run non-blocking field-level checks during editing, then full blocking validation on Run.
**When to use:** Every draft edit and Run action.
**Example:**
```typescript
// Source: locked decisions (hybrid validation)
const inline = validateDraftInline(control, nextValue);
setFieldState(control.id, inline);

const runValidation = validateDraftForRun({ catalog, draftValues });
if (!runValidation.ok) {
  // Highlight all invalid controls, keep edits intact, do not submit.
  return;
}
```

### Pattern 3: Canonical Template + Fresh Payload Build

**What:** For each Run, start from unmodified template JSON, clone, write back all mapped inputs, and submit only if all writes succeed.
**When to use:** Every Run attempt.
**Example:**
```typescript
// Source: locked decisions (no separate Apply, all-or-nothing write-back)
const payloadResult = buildRunWorkflowPayload({
  templateRawJson: activeTemplate.rawJson,
  catalog,
  draftValues
});

if (!payloadResult.ok) {
  // blocking invalid state, no run request
  return;
}

await runViaProxy({ endpointId, apiKey, input: payloadResult.inputEnvelope });
```

### Pattern 4: Overlay Ordering Model

**What:** Compute default order from `[Input#]` + full-title tie-break, then apply global user reorder overlay.
**When to use:** On every render of catalog order and on new template load.
**Example:**
```typescript
// Source: locked decisions (default first, then overlay; stale entries ignored)
const defaultOrdered = sortByInputIndexThenTitle(catalog.controls);
const ordered = applyOrderingOverlay(defaultOrdered, globalOverlay);
```

### Anti-Patterns to Avoid

- **UI-owned parser logic:** parser/order rules must live in shared pure functions, not component event handlers.
- **Mutation of template object during editing:** breaks canonical-template guarantee and leads to hidden regressions.
- **Heuristic type detection:** deriving control type from current value shape violates locked metadata-driven mapping rules.
- **Blocking edit interactions on inline errors:** conflicts with hybrid validation model and hurts fix workflow.

## Don't Hand-Roll

Problems that look simple but already have robust solutions/patterns:

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Runtime schema validation | Custom handwritten nested validators everywhere | Zod schemas + `safeParse` and error formatters | Produces consistent, typed, testable validation and cleaner user error mapping. |
| Durable browser draft persistence | Ad hoc JSON blobs scattered in localStorage keys | Dexie tables with explicit schema/versioning | Keeps draft/order storage maintainable as fields evolve. |
| Image preview conversion | Custom binary parsing pipeline | FileReader/URL browser APIs | Native, broadly supported path for preview and replace/remove UX. |
| Deep workflow cloning for apply-back | Partial shallow copy utilities | Full structured clone + targeted write-back | Prevents accidental template mutation and missing nested references. |

**Key insight:** the expensive bugs in this phase are consistency bugs (parser/order/type/apply mismatch), not rendering bugs. Centralize semantics in pure shared modules and keep UI thin.

## Common Pitfalls

### Pitfall 1: Prefix parser mismatch (`[Input#]` semantics drift)

**What goes wrong:** controls appear/disappear unexpectedly between sessions or templates.
**Why it happens:** permissive regex or case-insensitive matching diverges from locked exact-prefix rule.
**How to avoid:** enforce exact case-sensitive prefix handling and fixture-test duplicates, numbering gaps, and malformed titles.
**Warning signs:** same workflow yields different control counts after refactor.

### Pitfall 2: Title split ambiguity

**What goes wrong:** `Category.Name` parsing incorrectly truncates `Name` segments with dots.
**Why it happens:** splitting on all dots instead of first-dot split.
**How to avoid:** split on first dot only; remaining text stays in name; fallback to `Uncategorized` when parse is not clean.
**Warning signs:** controls with `Face.Eyes` lose suffix segments.

### Pitfall 3: Overlay ordering corruption

**What goes wrong:** new inputs vanish or stale IDs reorder unrelated controls.
**Why it happens:** overlay applied as authoritative list instead of sparse ordering hints.
**How to avoid:** always compute default order first, then apply overlay; ignore stale entries silently.
**Warning signs:** newly introduced `[Input#]` controls appear only after manual reset.

### Pitfall 4: Template mutation leaks into drafts

**What goes wrong:** reset/default behavior becomes inconsistent and cross-workflow loads pick up stale values.
**Why it happens:** editing mutates source template or uses previous payload as new baseline.
**How to avoid:** preserve canonical template unchanged; keep separate draft snapshot and last-successful-run snapshot.
**Warning signs:** “Reset to template defaults” does not restore import defaults exactly.

### Pitfall 5: Error message exposure of internals

**What goes wrong:** users see node IDs/graph internals in inline or Run-time errors.
**Why it happens:** raw validation errors passed directly to UI.
**How to avoid:** map technical errors to user-facing copy while keeping developer details in logs.
**Warning signs:** UI strings include raw workflow path fragments.

## Code Examples

Verified implementation patterns from current stack and official docs:

### Safe Parse for Control Metadata

```typescript
import * as z from "zod";

const controlDraftSchema = z.object({
  controlId: z.string(),
  value: z.unknown()
});

const result = controlDraftSchema.safeParse(input);
if (!result.success) {
  // map to user-facing field messages
  const fieldErrors = z.flattenError(result.error).fieldErrors;
}
```

Source: https://zod.dev/basics and https://zod.dev/error-formatting

### Runpod Envelope Shape

```typescript
const runRequestBody = {
  input: builtWorkflowPayload
};
```

Source: https://docs.runpod.io/serverless/endpoints/send-requests

### Image Preview via FileReader

```typescript
const reader = new FileReader();
reader.addEventListener("load", () => {
  setPreviewUrl(String(reader.result));
});
reader.readAsDataURL(file);
```

Source: https://developer.mozilla.org/en-US/docs/Web/API/FileReader/readAsDataURL

### Unicode Normalization for Name Validation Consistency

```typescript
const normalized = titleText.normalize("NFC");
```

Source: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| Handwritten ad hoc validation in form handlers | Schema-first validation and structured error formatting | Zod 4 stable | More reliable runtime checks and cleaner user error mapping. |
| Single-layer “is form valid” gating | Hybrid inline non-blocking + run-time blocking validation | Modern form UX standard | Better editing flow without sacrificing pre-run correctness. |
| Mutate working object during edits | Immutable canonical template + fresh per-run payload build | Current local-first app best practice | Strong reset semantics and lower state corruption risk. |
| Storage as one opaque draft blob | Versioned draft + ordering overlay records | Current Dexie/IndexedDB patterns | Easier migration and safer future phase extensions. |

**Deprecated/outdated:**

- Value-shape-driven coercion of string inputs to number/boolean in dynamic form editors.
- Treating ordering overlays as authoritative lists that replace derived defaults.
- Persisting complex editor state only in volatile component state without durable browser restoration.

## Open Questions

1. **Exact workflow metadata source for control typing**
   - What we know: locked decisions require metadata-driven types (no heuristic coercion).
   - What's unclear: exact metadata fields in target workflows for all control kinds (text, multiline, numeric, boolean, dimensions, image).
   - Recommendation: capture 3-5 representative real templates and define a strict type-mapping table before 03-01 implementation.

2. **Legacy parser/order parity reference coverage**
   - What we know: context asks compatibility with prior Chara2Img behavior and provided working example.
   - What's unclear: whether all historical edge cases are already documented in this repository.
   - Recommendation: add a parity fixture set in tests before UI implementation to lock parser/order behavior.

3. **Cross-workflow mapped-value compatibility rules**
   - What we know: A->B load should overlay compatible fields only; unmapped fields remain B defaults.
   - What's unclear: exact compatibility predicate (name only, name+type, or additional constraints).
   - Recommendation: define compatibility as `(normalized key + declared type + shape constraint)` in 03-02 planning acceptance tests.

## Sources

### Primary (HIGH confidence)

- https://zod.dev/
- https://zod.dev/basics
- https://zod.dev/error-formatting
- https://dexie.org/docs/Tutorial/React
- https://react.dev/reference/react/useState
- https://react.dev/reference/react/useMemo
- https://docs.runpod.io/serverless/endpoints/send-requests
- https://developer.mozilla.org/en-US/docs/Web/API/FileReader/readAsDataURL
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize
- Existing repository artifacts:
  - `.gsd/phases/03-dynamic-input-editing/03-CONTEXT.md`
  - `.gsd/REQUIREMENTS.md`
  - `src/shared/workflow/importWorkflow.ts`
  - `src/client/lib/workflowStorage.ts`
  - `src/shared/contracts/runpod.ts`

### Secondary (MEDIUM confidence)

- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Collator
- `.gsd/phases/02-workflow-import-and-template-reuse/02-RESEARCH.md` (for continuity with Phase 2 stack and architecture)

### Tertiary (LOW confidence)

- Prior Chara2Img parser/order implementation details are referenced by context but not fully present in this repository snapshot; parity assumptions require fixture-based confirmation.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - directly backed by existing dependencies and official docs.
- Architecture: MEDIUM-HIGH - pipeline and persistence model is strongly supported, but some mapping specifics depend on real workflow metadata coverage.
- Pitfalls: HIGH - directly derived from locked decisions and common dynamic-form failure modes.

**Research date:** 2026-05-23
**Valid until:** 2026-06-22
