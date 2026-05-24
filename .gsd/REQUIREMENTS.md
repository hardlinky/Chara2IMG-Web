# Requirements: Chara2Img Web v1.1 UX and QOL

**Defined:** 2026-05-24
**Milestone:** v1.1 UX and QOL
**Core Value:** Enable reliable full-parity web generation workflows against Runpod serverless ComfyUI, with user-supplied API keys and no always-on ComfyUI host.

## v1.1 Requirements

### Visual System and UI Foundation

- [ ] **UI-01**: User sees a consistent visual design system (typography, spacing, color usage, and card/surface treatment) across Setup/Input/Jobs/Output tabs.
- [ ] **UI-02**: User can distinguish primary actions, secondary actions, and destructive actions through clear visual hierarchy.
- [ ] **UI-03**: User can use the app comfortably on desktop and mobile layouts with no clipped or overlapping primary content.
- [ ] **UI-04**: User gets clear, accessible interaction states (focus, hover, active, disabled, error) on all key controls.

### Workflow Presets

- [ ] **PRESET-01**: User can save the current workflow template plus input draft values as a named preset.
- [ ] **PRESET-02**: User can apply a saved preset to the currently active compatible workflow in one action.
- [ ] **PRESET-03**: User can rename and delete saved presets from a preset management surface.

### Input Editing Quality of Life

- [ ] **INPUT-01**: User can reset all inputs or a single category to template defaults without re-importing workflow files.
- [ ] **INPUT-02**: User can clearly see which inputs changed since last successful run.
- [ ] **INPUT-03**: Run-blocking validation feedback points to affected fields with actionable messages.

### Jobs Quality of Life

- [ ] **JOBS-01**: User can search/filter recent jobs by workflow name and status simultaneously.
- [ ] **JOBS-02**: User can quickly identify rerun lineage (source job vs rerun job) in the jobs list.
- [ ] **JOBS-03**: User can pin or favorite important recent jobs so they remain easy to find.

### Output Review Quality of Life

- [ ] **OUTUX-01**: User can add notes/tags to completed job output groups.
- [ ] **OUTUX-02**: User can filter output gallery by workflow name, tags, and completion recency.
- [ ] **OUTUX-03**: User can view compact per-output provenance metadata without leaving gallery flow.

## Future Requirements (Deferred)

- **AUTH-ADMIN-01**: Admin can manage invited users from an internal UI.
- **SYNC-01**: User can resume long-running job tracking across devices.
- **SHARE-01**: User can export/import presets between browsers.

## Out of Scope (v1.1)

| Feature | Reason |
| ------- | ------ |
| Admin invite management UI | Deferred to dedicated access/admin milestone to avoid mixing UX polish with policy/security workflows. |
| Cross-device live job state sync | Requires account/session model expansion outside current invited-browser-local architecture. |
| Public self-service onboarding | Product remains invited-user focused in near-term iterations. |

## Traceability

| Requirement | Phase | Status |
| ----------- | ----- | ------ |
| UI-01 | Phase 6 | Pending |
| UI-02 | Phase 6 | Pending |
| UI-03 | Phase 6 | Pending |
| UI-04 | Phase 6 | Pending |
| PRESET-01 | Phase 7 | Pending |
| PRESET-02 | Phase 7 | Pending |
| PRESET-03 | Phase 7 | Pending |
| INPUT-01 | Phase 7 | Pending |
| INPUT-02 | Phase 7 | Pending |
| INPUT-03 | Phase 7 | Pending |
| JOBS-01 | Phase 8 | Pending |
| JOBS-02 | Phase 8 | Pending |
| JOBS-03 | Phase 8 | Pending |
| OUTUX-01 | Phase 8 | Pending |
| OUTUX-02 | Phase 8 | Pending |
| OUTUX-03 | Phase 8 | Pending |

**Coverage:**

- v1.1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---

_Requirements defined: 2026-05-24 for milestone v1.1 UX and QOL (UI-first)_# Requirements: Chara2Img Web v1.1 UX and QOL

**Defined:** 2026-05-24
**Milestone:** v1.1 UX and QOL
**Core Value:** Enable reliable full-parity web generation workflows against Runpod serverless ComfyUI, with user-supplied API keys and no always-on ComfyUI host.

## v1.1 Requirements

### Workflow Presets

- [ ] **PRESET-01**: User can save the current workflow template plus input draft values as a named preset.
- [ ] **PRESET-02**: User can apply a saved preset to the currently active compatible workflow in one action.
- [ ] **PRESET-03**: User can rename and delete saved presets from a preset management surface.

### Input Editing Quality of Life

- [ ] **INPUT-01**: User can reset all inputs or a single category to template defaults without re-importing workflow files.
- [ ] **INPUT-02**: User can clearly see which inputs changed since last successful run.
- [ ] **INPUT-03**: Run-blocking validation feedback points to affected fields with actionable messages.

### Jobs Quality of Life

- [ ] **JOBS-01**: User can search/filter recent jobs by workflow name and status simultaneously.
- [ ] **JOBS-02**: User can quickly identify rerun lineage (source job vs rerun job) in the jobs list.
- [ ] **JOBS-03**: User can pin or favorite important recent jobs so they remain easy to find.

### Output Review Quality of Life

- [ ] **OUTUX-01**: User can add notes/tags to completed job output groups.
- [ ] **OUTUX-02**: User can filter output gallery by workflow name, tags, and completion recency.
- [ ] **OUTUX-03**: User can view compact per-output provenance metadata without leaving gallery flow.

## Future Requirements (Deferred)

- **AUTH-ADMIN-01**: Admin can manage invited users from an internal UI.
- **SYNC-01**: User can resume long-running job tracking across devices.
- **SHARE-01**: User can export/import presets between browsers.

## Out of Scope (v1.1)

| Feature | Reason |
| ------- | ------ |
| Admin invite management UI | Deferred to dedicated access/admin milestone to avoid mixing UX polish with policy/security workflows. |
| Cross-device live job state sync | Requires account/session model expansion outside current invited-browser-local architecture. |
| Public self-service onboarding | Product remains invited-user focused in near-term iterations. |

## Traceability

| Requirement | Phase | Status |
| ----------- | ----- | ------ |
| PRESET-01 | Phase 6 | Pending |
| PRESET-02 | Phase 6 | Pending |
| PRESET-03 | Phase 6 | Pending |
| INPUT-01 | Phase 6 | Pending |
| INPUT-02 | Phase 6 | Pending |
| INPUT-03 | Phase 7 | Pending |
| JOBS-01 | Phase 7 | Pending |
| JOBS-02 | Phase 7 | Pending |
| JOBS-03 | Phase 7 | Pending |
| OUTUX-01 | Phase 8 | Pending |
| OUTUX-02 | Phase 8 | Pending |
| OUTUX-03 | Phase 8 | Pending |

**Coverage:**

- v1.1 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0

---

_Requirements defined: 2026-05-24 for milestone v1.1 UX and QOL_# Requirements: Chara2Img Web

**Defined:** 2026-05-23
**Core Value:** Enable reliable full-parity web generation workflows against Runpod serverless ComfyUI, with user-supplied API keys and no always-on ComfyUI host.

## v1 Requirements

### Workflow Import

- [ ] **WFLO-01**: User can load a custom ComfyUI workflow JSON file into the web app.
- [ ] **WFLO-02**: User can validate that the uploaded workflow JSON is structurally valid before running jobs.
- [ ] **WFLO-03**: The app preserves the full original workflow JSON as the template source instead of rewriting or reducing it on import.
- [ ] **WFLO-04**: User can reuse the loaded workflow template across multiple job runs without re-uploading it.

### Dynamic Inputs

- [x] **INPT-01**: User can see input controls generated from supported workflow nodes in the loaded workflow.
- [x] **INPT-02**: User can edit text and multiline text inputs derived from the workflow.
- [x] **INPT-03**: User can edit numeric inputs derived from the workflow, including integer and decimal values.
- [x] **INPT-04**: User can edit boolean inputs derived from the workflow.
- [x] **INPT-05**: User can edit paired dimension inputs derived from the workflow.
- [x] **INPT-06**: User can provide image inputs for workflow nodes that require image data.
- [x] **INPT-07**: The app applies edited input values back into a job-ready workflow payload before submission.
- [x] **INPT-08**: The app preserves workflow input grouping and ordering well enough for the user to work with the template reliably.

### Jobs

- [x] **JOBS-01**: User can submit a job to a Runpod serverless ComfyUI endpoint using the current workflow and inputs.
- [x] **JOBS-02**: User can see the current status of each submitted job.
- [x] **JOBS-03**: The app polls Runpod job status until the job completes, fails, is cancelled, or times out.
- [x] **JOBS-04**: User can cancel a running or queued job.
- [x] **JOBS-05**: User can rerun a prior job using that job's saved workflow inputs.
- [x] **JOBS-06**: User can load a prior job's saved inputs back into the Input tab.
- [x] **JOBS-07**: User can remove a job from the visible job list.
- [x] **JOBS-08**: The app keeps enough job history in the web app for invited users to manage recent runs during normal usage.

### Outputs

- [ ] **OUTP-01**: User can view generated outputs for completed jobs in an Outputs tab.
- [ ] **OUTP-02**: User can view multiple generated images for a single job.
- [ ] **OUTP-03**: The app keeps each output associated with the job that produced it.
- [ ] **OUTP-04**: User can browse outputs in a gallery-oriented view.

### Access And Keys

- [ ] **AUTH-01**: User can provide their own Runpod API key in the web app.
- [ ] **AUTH-02**: User can choose to remember their Runpod API key in browser-local storage on their device.
- [ ] **AUTH-03**: The backend forwards Runpod lifecycle calls without persisting user API keys as long-term server-side stored secrets.
- [ ] **AUTH-04**: The app supports invited-user access rather than public open sign-up for v1.

## v2 Requirements

### Workflow Import

- **WFLO-05**: User can save named workflow presets in the app.

### Jobs

- **JOBS-09**: User can resume long-running job tracking across devices.

### Outputs

- **OUTP-05**: User can attach notes, tags, or metadata to generated outputs.

### Access And Keys

- **AUTH-05**: Admin can manage invited users from an internal UI.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Public self-serve multi-tenant launch | v1 targets invited users only. |
| Persistent server-hosted API key vault | BYOK model should avoid long-term server-side secret storage. |
| Self-hosted always-on ComfyUI backend | Product depends on existing Runpod serverless endpoints. |
| Native desktop packaging | v1 is specifically a web migration for lightweight pod deployment. |
| Mobile-native app | Web-first delivery is sufficient for initial users. |

## Traceability

| Requirement | Phase | Status |
| ----------- | ----- | ------ |
| WFLO-01 | Phase 2 | Pending |
| WFLO-02 | Phase 2 | Pending |
| WFLO-03 | Phase 2 | Pending |
| WFLO-04 | Phase 2 | Pending |
| INPT-01 | Phase 3 | Complete |
| INPT-02 | Phase 3 | Complete |
| INPT-03 | Phase 3 | Complete |
| INPT-04 | Phase 3 | Complete |
| INPT-05 | Phase 3 | Complete |
| INPT-06 | Phase 3 | Complete |
| INPT-07 | Phase 3 | Complete |
| INPT-08 | Phase 3 | Complete |
| JOBS-01 | Phase 4 | Complete |
| JOBS-02 | Phase 4 | Complete |
| JOBS-03 | Phase 4 | Complete |
| JOBS-04 | Phase 4 | Complete |
| JOBS-05 | Phase 4 | Complete |
| JOBS-06 | Phase 4 | Complete |
| JOBS-07 | Phase 4 | Complete |
| JOBS-08 | Phase 4 | Complete |
| OUTP-01 | Phase 5 | Pending |
| OUTP-02 | Phase 5 | Pending |
| OUTP-03 | Phase 5 | Pending |
| OUTP-04 | Phase 5 | Pending |
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |

**Coverage:**

- v1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0 ✓

---

_Requirements defined: 2026-05-23_
_Last updated: 2026-05-23 after roadmap mapping_
