# Roadmap: Chara2Img Web

## Overview

Chara2Img Web ships as a private, browser-based replacement for the existing WPF workflow: invited users bring their own Runpod API keys, load full ComfyUI workflow templates, edit derived inputs, run and manage jobs, and review outputs without maintaining a local ComfyUI host. The roadmap is organized around the product's actual delivery boundaries, starting with secure access and transport, then moving through workflow parity, job lifecycle control, and output review.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Access and Proxy Boundary** - Invited users can securely reach Runpod through the web app with BYOK handling.
- [x] **Phase 2: Workflow Import and Template Reuse** - Users can load, validate, and retain full workflow templates for repeated runs.
- [x] **Phase 3: Dynamic Input Editing** - Users can edit workflow-derived controls and produce a job-ready payload reliably.
- [x] **Phase 4: Job Lifecycle and Run Management** - Users can submit, monitor, control, and revisit recent runs.
- [ ] **Phase 5: Outputs and Gallery Review** - Users can review completed job outputs with job provenance in a gallery flow.

## Phase Details

### Phase 1: Access and Proxy Boundary

**Goal**: Invited users can securely access the app and use their own Runpod API keys through a thin web proxy without long-term server-side key storage.
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04
**Success Criteria** (what must be TRUE):

1. User can access the app through an invited-user path rather than public self-sign-up.
2. User can enter a Runpod API key in the app and decide whether to remember it on the current browser.
3. A remembered API key is restored only on the same browser/device when the user opted in.
4. Runpod lifecycle requests can be forwarded by the backend without long-term server-side key persistence.

**Plans**: 5 plans

Plans:

- [x] 01-01: Scaffold minimal TypeScript and Hono baseline for access-boundary work
- [x] 01-02: Build server-side invited-user session middleware and secure access endpoints
- [x] 01-03: Implement invite-gated client UX and browser-scoped BYOK settings behavior
- [x] 01-04: Implement thin Runpod proxy core with validated forwarding and key-safe handling
- [x] 01-05: Add typed client proxy smoke flow and tests proving boundary behavior

### Phase 2: Workflow Import and Template Reuse

**Goal**: Users can import existing ComfyUI workflow JSON templates, know whether they are valid, and reuse the full template across repeated web sessions.
**Depends on**: Phase 1
**Requirements**: WFLO-01, WFLO-02, WFLO-03, WFLO-04
**Success Criteria** (what must be TRUE):

1. User can upload a ComfyUI workflow JSON file and immediately see whether it is structurally valid for this app.
2. The app keeps the full original workflow JSON as the working template rather than rewriting it into a reduced form.
3. User can return to a previously loaded valid workflow template without re-uploading it for each run.
4. User can treat the loaded workflow as a reusable template for multiple later job submissions.

**Plans**: 2 plans

Plans:

- [x] 02-01: Implement workflow import, validation, and normalization entry points
- [x] 02-02: Persist reusable full-fidelity workflow templates for repeat use

### Phase 3: Dynamic Input Editing

**Goal**: Users can work against a trustworthy input surface derived from the workflow and have those edits applied back into a job-ready workflow payload.
**Depends on**: Phase 2
**Requirements**: INPT-01, INPT-02, INPT-03, INPT-04, INPT-05, INPT-06, INPT-07, INPT-08
**Success Criteria** (what must be TRUE):

1. User can see generated input controls for supported workflow nodes in a stable grouping and ordering.
2. User can edit text, multiline text, numeric, boolean, dimension, and image inputs derived from the workflow.
3. The app applies the edited values back into the underlying workflow payload correctly before submission.
4. The input tab remains understandable and repeatable enough for users to work with the same template reliably over multiple runs.

**Plans**: 2 plans

Plans:

- [ ] 03-01: Generate typed input controls from normalized workflow definitions
- [ ] 03-02: Apply edited values back into a validated job-ready workflow payload

### Phase 4: Job Lifecycle and Run Management

**Goal**: Users can submit jobs to Runpod, observe lifecycle state, and manage recent runs without losing the workflow context needed for iteration.
**Depends on**: Phase 1, Phase 2, Phase 3
**Requirements**: JOBS-01, JOBS-02, JOBS-03, JOBS-04, JOBS-05, JOBS-06, JOBS-07, JOBS-08
**Success Criteria** (what must be TRUE):

1. User can submit the current workflow and inputs to Runpod and see the job appear in a recent jobs list.
2. Each submitted job shows an up-to-date status until it completes, fails, is cancelled, or times out.
3. User can cancel a queued or running job from the jobs list.
4. User can rerun a previous job, reload that job's saved inputs into the Input tab, and remove a job from the visible list while recent history remains available for normal usage.

**Plans**: 3 plans

Plans:

- [x] 04-01: Implement job submission contracts and Runpod lifecycle state tracking
- [x] 04-02: Build polling, timeout, and cancellation behavior around recent jobs
- [x] 04-03: Add rerun, load-inputs, remove, and recent-history management flows

### Phase 5: Outputs and Gallery Review

**Goal**: Users can review the images produced by completed jobs in an output gallery that preserves job provenance.
**Depends on**: Phase 4
**Requirements**: OUTP-01, OUTP-02, OUTP-03, OUTP-04
**Success Criteria** (what must be TRUE):

1. User can open an Outputs tab and view outputs from completed jobs.
2. User can view multiple generated images for a single job in one output flow.
3. Each output remains associated with the job that produced it.
4. User can browse outputs through a gallery-oriented UI rather than a raw payload view.

**Plans**: 2 plans

Plans:

- [ ] 05-01: Capture completed job outputs with per-job provenance metadata
- [ ] 05-02: Build outputs tab and gallery browsing for completed runs

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
| ----- | -------------- | ------ | --------- |
| 1. Access and Proxy Boundary | 5/5 | Complete | 2026-05-23 |
| 2. Workflow Import and Template Reuse | 2/2 | Complete | 2026-05-23 |
| 3. Dynamic Input Editing | 2/2 | Complete | 2026-05-23 |
| 4. Job Lifecycle and Run Management | 3/3 | Complete | 2026-05-24 |
| 5. Outputs and Gallery Review | 0/2 | Not started | - |