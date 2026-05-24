# Phase 2: Workflow Import and Template Reuse - Research

**Researched:** 2026-05-23
**Domain:** ComfyUI workflow import, validation, and browser-local template persistence
**Confidence:** MEDIUM-HIGH

## Summary

Phase 2 should treat workflow import as a fidelity problem, not a JSON parsing problem. Current ComfyUI workflow JSON is schema-defined, but it is intentionally permissive in the places that matter for interoperability: node IDs can be strings or integers, positions and sizes can be arrays or objects, `widgets_values` can be arrays or objects, and many objects allow extra properties. That means a planner should expect a two-layer implementation: first validate that the file is a real ComfyUI workflow, then normalize it into an app-owned representation that preserves the original payload verbatim for reuse across sessions.

For browser-local reuse, IndexedDB is the right persistence layer and Dexie is the right library in this stack. IndexedDB is asynchronous, transactional, same-origin scoped, and can store structured clone values including blobs, which makes it a better fit than `localStorage` for full workflow templates and future metadata. The safest pattern is to store the raw imported workflow JSON plus a compact normalized record for indexing, display, and validation state. Do not collapse the imported workflow down to only extracted inputs, because Phase 1 and the roadmap require full workflow JSON fidelity.

The repo currently has no workflow corpus or sample JSON fixtures. That is a planning gap, not just an implementation detail. Phase planning should explicitly include a validation fixture corpus made from real ComfyUI exports or legacy WPF templates, because the main risk in this phase is overfitting the parser to one happy-path sample.

**Primary recommendation:** use Zod-backed import validation plus a versioned Dexie template store that keeps the raw workflow JSON unchanged and stores only derived metadata separately.

## Standard Stack

The established stack for this phase is the existing React/Vite client plus Zod for validation and Dexie on IndexedDB for local persistence.

### Core

| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| Zod | 4.x | Runtime validation for imported workflow files and normalized template records | Fits the repo stack, gives strict parsing without introducing a second schema system, and can validate the browser import boundary before anything is persisted. |
| Dexie | 4.4.x | Browser-local IndexedDB wrapper | The repo research already recommends Dexie for browser-local persistence. It is the right abstraction for versioned template storage, transactions, and querying templates by fingerprint or display name. |
| IndexedDB | Browser standard | Durable same-origin storage for workflow templates and metadata | IndexedDB is asynchronous, transactional, and can store structured clone data, including blobs. It is the right storage substrate for full workflow templates. |
| TypeScript | 5.9.x | Type-safe workflow model, validation results, and template store contracts | Needed to keep the raw workflow shape, normalized shape, and validation errors aligned across the client. |

### Supporting

| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| React | 19.x | Client UI for import, validation state, template picker, and reuse UX | Use for the import dialog, invalid-template states, and session restore flow. |
| Vite | 7.x | Fast build/dev loop for the browser app | Use as the client runtime and test target. |
| Crypto Subtle API | Browser standard | Stable content fingerprinting for dedupe and versioning | Use to derive workflow fingerprints from raw JSON without inventing a custom hash package. |
| File API / Blob | Browser standard | Reading uploaded JSON files and persisting future export artifacts | Use for file import, export, and any future template backup. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| ---------- | --------- | -------- |
| Dexie + IndexedDB | `localStorage` | `localStorage` is too small, synchronous, and poor at storing structured template records or blobs. It is acceptable only for tiny flags, not for reusable workflow templates. |
| Zod validation | Ad hoc `JSON.parse` plus `if` checks | Ad hoc validation will miss schema drift and permissive edge cases in real ComfyUI exports. |
| Raw JSON overwrite on import | Canonicalizing the template down to extracted inputs only | That destroys fidelity and makes later rerun/reuse behavior less reliable. |

**Installation:**
```bash
npm install dexie
```

## Architecture Patterns

### Recommended Project Structure

```text
src/
├── client/
│   ├── features/
│   │   └── workflows/        # import UI, validation feedback, template picker
│   ├── lib/
│   │   └── workflowStorage.ts # Dexie adapter and template CRUD
│   └── shared/
│       └── workflow/          # raw/normalized workflow types and helpers
├── shared/
│   └── contracts/             # workflow import result and template DTOs
└── tests/
    └── client/                # fixture-driven validation and storage tests
```

### Pattern 1: Raw Canonical Blob + Derived Metadata

**What:** Store the exact imported workflow JSON as the canonical payload, and derive a separate normalized record for search, display, and validation state.
**When to use:** Always, when full JSON fidelity matters and the UI still needs readable metadata.
**Why:** This preserves round-trip fidelity while still supporting indexes, labels, and validation status.

**Example:**
```typescript
// Source: https://docs.comfy.org/specs/workflow_json
type StoredWorkflowTemplate = {
  id: string;
  rawJson: string;
  parsedWorkflow: unknown;
  fingerprint: string;
  displayName: string;
  schemaVersion: 1;
  importedAt: number;
};
```

### Pattern 2: Two-Stage Validation

**What:** First validate that the file is a ComfyUI workflow shape, then validate app-specific import rules such as required input-node conventions.
**When to use:** Always, because ComfyUI schema validity and product validity are not the same thing.
**Why:** A file can be a valid ComfyUI workflow and still be unusable for this app if it does not expose the expected template conventions.

**Example:**
```typescript
// Source: https://docs.comfy.org/specs/workflow_json
const workflowImportResult = validateWorkflowShape(fileJson);
if (!workflowImportResult.success) {
  return workflowImportResult;
}

const templateRulesResult = validateChara2ImgTemplate(workflowImportResult.data);
if (!templateRulesResult.success) {
  return templateRulesResult;
}
```

### Pattern 3: Versioned Template Store

**What:** Version the local template schema and migrate stored templates deliberately.
**When to use:** As soon as templates are persisted.
**Why:** The browser store will need to survive schema evolution, and the raw workflow format itself has versioned JSON schema changes.

### Anti-Patterns to Avoid

- **Treating import success as `JSON.parse` success:** the file still needs shape validation and template-rule validation.
- **Normalizing away the raw workflow:** do not replace the imported workflow with only extracted controls or prompt inputs.
- **Using `localStorage` for templates:** it is the wrong storage tier for large structured data and has no transaction model.
- **Building a custom schema engine:** ComfyUI already publishes a workflow schema; use it and layer app rules on top.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Workflow persistence | A hand-rolled `localStorage` blob store | Dexie + IndexedDB | IndexedDB is transactional, async, and handles large structured data and blobs. |
| Import validation | A custom permissive parser with ad hoc checks | Zod validation layered over ComfyUI schema rules | The workflow schema is permissive enough that loose parsing will miss real-world edge cases. |
| Template versioning | A one-off `JSON.stringify` save/load format | Versioned Dexie records with explicit migration paths | Versioned records keep the store maintainable as template metadata evolves. |
| Duplicate detection | Comparing filenames only | Raw JSON fingerprinting | Users can import the same template under different names, so filename-only dedupe is unreliable. |

**Key insight:** the hard part is not storing bytes; it is preserving exact workflow fidelity while still giving the app a stable import status, dedupe key, and reusable metadata layer.

## Common Pitfalls

### Pitfall 1: Overfitting to one workflow export

**What goes wrong:** the parser works on one sample and fails on real workflows because node IDs, positions, widgets, and optional properties vary.
**Why it happens:** ComfyUI workflow JSON is flexible by design and allows additional properties in many places.
**How to avoid:** use a real fixture corpus and test multiple workflow shapes, not just one export.
**Warning signs:** the importer passes only one sample, or tests assert exact property order.

### Pitfall 2: Treating schema validity as product validity

**What goes wrong:** the app accepts a workflow as valid even though it does not expose the right template fields or node conventions for reuse.
**Why it happens:** ComfyUI schema validation and Chara2Img-specific template conventions are separate concerns.
**How to avoid:** make import validation a two-stage pipeline.
**Warning signs:** import UI says “valid” before the template is actually reusable.

### Pitfall 3: Losing fidelity during normalization

**What goes wrong:** normalization strips fields that are needed later for rerun, reuse, or compatibility with future workflow revisions.
**Why it happens:** it is tempting to simplify the imported object into only the visible controls.
**How to avoid:** keep the raw workflow JSON as the source of truth and store normalization output separately.
**Warning signs:** saved templates cannot round-trip back to the original JSON.

### Pitfall 4: Using browser storage that cannot scale with the data shape

**What goes wrong:** large workflows or repeated imports become fragile, synchronous, or quota-sensitive in the wrong way.
**Why it happens:** `localStorage` looks convenient but is not built for structured, versioned data.
**How to avoid:** use IndexedDB and be explicit about quota-sensitive template sizes.
**Warning signs:** import hangs the UI, large templates disappear, or the app crashes on repeated saves.

### Pitfall 5: No fixture corpus for regression testing

**What goes wrong:** the implementation ships without a realistic validation set, so new templates break silently later.
**Why it happens:** the repo currently has no workflow corpus or sample JSON fixtures.
**How to avoid:** create a fixture corpus during planning and treat it as part of the acceptance criteria.
**Warning signs:** no tests cover legacy exports, malformed-but-common variants, or template round-trip behavior.

## Code Examples

Verified patterns from official sources:

### ComfyUI Workflow Shape

```json
{
  "version": 1,
  "state": {},
  "nodes": [
    {
      "id": 1,
      "type": "CheckpointLoaderSimple",
      "pos": [0, 0],
      "size": [320, 180],
      "flags": {},
      "order": 0,
      "mode": 0,
      "properties": {},
      "widgets_values": []
    }
  ],
  "links": []
}
```

Source: https://docs.comfy.org/specs/workflow_json

### Dexie Versioned Store

```typescript
import Dexie, { type Table } from 'dexie';

type WorkflowTemplateRow = {
  id: string;
  fingerprint: string;
  name: string;
  rawJson: string;
  importedAt: number;
  schemaVersion: number;
};

class WorkflowTemplateDatabase extends Dexie {
  templates!: Table<WorkflowTemplateRow, string>;

  constructor() {
    super('chara2img-workflows');
    this.version(1).stores({
      templates: '&id, fingerprint, name, importedAt, schemaVersion',
    });
  }
}
```

Source: https://dexie.org/docs/ and https://dexie.org/docs/Version/Version.stores()

### IndexedDB-First Storage Rule

```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
// Store the raw workflow JSON and any blobs in IndexedDB rather than localStorage.
// IndexedDB is asynchronous, transactional, and intended for larger structured data.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| Parse imported JSON loosely and save only derived inputs | Validate against ComfyUI workflow schema, then store the raw workflow plus derived metadata | Current ComfyUI v1 schema | Preserves fidelity and makes reuse safer. |
| Store reusable templates in `localStorage` | Store them in IndexedDB through Dexie | Browser persistence best practice | Handles larger structured data and versioned records. |
| Treat import as a single boolean success/fail check | Return validation status plus normalization status plus template-rule status | Current workflow import UX expectations | Makes invalid or partially compatible templates actionable. |
| Save templates by filename only | Save templates by content fingerprint plus user label | Current local-first app patterns | Prevents duplicates and enables renaming without data loss. |

**Deprecated/outdated:**

- **Filename-only template identity:** breaks as soon as users rename imports or re-import the same workflow.
- **`localStorage` as the primary workflow store:** too fragile for large, structured, versioned template data.
- **One-step validation:** hides whether the workflow is malformed or merely not reusable by app rules.

## Open Questions

1. **Do we need legacy workflow compatibility beyond ComfyUI v1?**
   - What we know: the current ComfyUI docs list v1.0 as latest and also expose older versions.
   - What's unclear: whether Chara2Img Web must import older exports during Phase 2 or can start with v1 only.
   - Recommendation: plan v1-first, but reserve a fixture slot for at least one older export if the user corpus contains it.

2. **What exact template conventions define a reusable Chara2Img workflow?**
   - What we know: this phase needs to preserve full workflow fidelity and validate importability.
   - What's unclear: the repo has no local workflow corpus yet, so the exact `[Input]` or node-exposure conventions are not defined here.
   - Recommendation: collect real workflows before finalizing parser rules, then encode those rules as fixture-backed tests.

3. **Should template reuse include imported outputs or only workflow inputs?**
   - What we know: ComfyUI can load full workflows from generated files, and this phase cares about full workflow reuse.
   - What's unclear: whether repeated-session reuse needs embedded result metadata or only the template itself.
   - Recommendation: keep the first implementation focused on template JSON fidelity and add result artifacts later if a real need appears.

4. **How large can the local template corpus become before quota becomes a product issue?**
   - What we know: IndexedDB is appropriate for large structured data, but browser quotas still vary.
   - What's unclear: actual workflow/template size distribution in this product.
   - Recommendation: measure corpus size during planning and add a quota test before Phase 2 completes.

5. **Should import accept only JSON files or also workflow payloads embedded in PNG/WebP/FLAC?**
   - What we know: ComfyUI supports loading full workflows from generated PNG, WebP, and FLAC files.
   - What's unclear: whether the product scope for Phase 2 includes those carriers or only explicit JSON imports.
   - Recommendation: decide this before implementation, because file-carrier support changes the import pipeline and validation fixtures.

## Sources

### Primary (HIGH confidence)

- https://docs.comfy.org/specs/workflow_json - current ComfyUI workflow JSON schema and required fields.
- https://github.com/Comfy-Org/ComfyUI - ComfyUI README features, including saving/loading workflows as JSON and loading full workflows from generated files.
- https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API - IndexedDB async, transactional storage model and same-origin scoping.
- https://dexie.org/docs/ - Dexie documentation and local database guidance.
- https://docs.runpod.io/serverless/endpoints/send-requests - Runpod result retention and async job lifecycle context.

### Secondary (MEDIUM confidence)

- https://www.comfy.org/cloud - Comfy Cloud positioning around app-mode workflows and reuse-oriented UX.
- https://docs.comfy.org/development/comfyui-server/comms_routes - ComfyUI routes and prompt validation behavior.
- .gsd/research/STACK.md - repo stack baseline that already recommends Dexie, Zod, React 19, Vite 7, and a thin proxy.
- .gsd/research/ARCHITECTURE.md - repo architecture baseline that recommends browser-local template storage and browser-owned workflow parsing.
- .gsd/research/FEATURES.md - repo feature baseline that marks workflow import and validation as table-stakes.
- .gsd/research/PITFALLS.md - repo pitfall baseline warning against fragile workflow parsing and `localStorage`-based persistence.

### Tertiary (LOW confidence)

- No local workflow corpus or sample JSON fixtures exist in the repository at the time of research. This is a planning gap and should be addressed before implementation begins.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - backed by current repo research plus official docs for ComfyUI, IndexedDB, and Dexie.
- Architecture: MEDIUM-HIGH - the raw-plus-derived storage model is well-supported, but exact Chara2Img template conventions still need a local corpus.
- Pitfalls: HIGH - schema permissiveness, browser storage limits, and fidelity loss are directly supported by official docs and repo research.

**Research date:** 2026-05-23
**Valid until:** 2026-06-22