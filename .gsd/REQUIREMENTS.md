# Requirements: Chara2Img Web

**Defined:** 2026-05-23
**Core Value:** Enable reliable full-parity web generation workflows against Runpod serverless ComfyUI, with user-supplied API keys and no always-on ComfyUI host.

## v1 Requirements

### Workflow Import

- [ ] **WFLO-01**: User can load a custom ComfyUI workflow JSON file into the web app.
- [ ] **WFLO-02**: User can validate that the uploaded workflow JSON is structurally valid before running jobs.
- [ ] **WFLO-03**: The app preserves the full original workflow JSON as the template source instead of rewriting or reducing it on import.
- [ ] **WFLO-04**: User can reuse the loaded workflow template across multiple job runs without re-uploading it.

### Dynamic Inputs

- [ ] **INPT-01**: User can see input controls generated from supported workflow nodes in the loaded workflow.
- [ ] **INPT-02**: User can edit text and multiline text inputs derived from the workflow.
- [ ] **INPT-03**: User can edit numeric inputs derived from the workflow, including integer and decimal values.
- [ ] **INPT-04**: User can edit boolean inputs derived from the workflow.
- [ ] **INPT-05**: User can edit paired dimension inputs derived from the workflow.
- [ ] **INPT-06**: User can provide image inputs for workflow nodes that require image data.
- [ ] **INPT-07**: The app applies edited input values back into a job-ready workflow payload before submission.
- [ ] **INPT-08**: The app preserves workflow input grouping and ordering well enough for the user to work with the template reliably.

### Jobs

- [ ] **JOBS-01**: User can submit a job to a Runpod serverless ComfyUI endpoint using the current workflow and inputs.
- [ ] **JOBS-02**: User can see the current status of each submitted job.
- [ ] **JOBS-03**: The app polls Runpod job status until the job completes, fails, is cancelled, or times out.
- [ ] **JOBS-04**: User can cancel a running or queued job.
- [ ] **JOBS-05**: User can rerun a prior job using that job's saved workflow inputs.
- [ ] **JOBS-06**: User can load a prior job's saved inputs back into the Input tab.
- [ ] **JOBS-07**: User can remove a job from the visible job list.
- [ ] **JOBS-08**: The app keeps enough job history in the web app for invited users to manage recent runs during normal usage.

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
| WFLO-01 | Unmapped | Pending |
| WFLO-02 | Unmapped | Pending |
| WFLO-03 | Unmapped | Pending |
| WFLO-04 | Unmapped | Pending |
| INPT-01 | Unmapped | Pending |
| INPT-02 | Unmapped | Pending |
| INPT-03 | Unmapped | Pending |
| INPT-04 | Unmapped | Pending |
| INPT-05 | Unmapped | Pending |
| INPT-06 | Unmapped | Pending |
| INPT-07 | Unmapped | Pending |
| INPT-08 | Unmapped | Pending |
| JOBS-01 | Unmapped | Pending |
| JOBS-02 | Unmapped | Pending |
| JOBS-03 | Unmapped | Pending |
| JOBS-04 | Unmapped | Pending |
| JOBS-05 | Unmapped | Pending |
| JOBS-06 | Unmapped | Pending |
| JOBS-07 | Unmapped | Pending |
| JOBS-08 | Unmapped | Pending |
| OUTP-01 | Unmapped | Pending |
| OUTP-02 | Unmapped | Pending |
| OUTP-03 | Unmapped | Pending |
| OUTP-04 | Unmapped | Pending |
| AUTH-01 | Unmapped | Pending |
| AUTH-02 | Unmapped | Pending |
| AUTH-03 | Unmapped | Pending |
| AUTH-04 | Unmapped | Pending |

**Coverage:**

- v1 requirements: 28 total
- Mapped to phases: 0
- Unmapped: 28 ⚠️

---

_Requirements defined: 2026-05-23_
_Last updated: 2026-05-23 after initial definition_
