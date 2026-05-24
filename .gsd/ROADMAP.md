# Roadmap: Chara2Img Web

## Milestones

- ✅ v1.0 MVP - Phases 1-5 (shipped 2026-05-24)
- 🚧 v1.1 UX and QOL - Phases 6-8 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-5) - SHIPPED 2026-05-24</summary>

- [x] Phase 1: Access and Proxy Boundary (5/5 plans)
- [x] Phase 2: Workflow Import and Template Reuse (2/2 plans)
- [x] Phase 3: Dynamic Input Editing (2/2 plans)
- [x] Phase 4: Job Lifecycle and Run Management (3/3 plans)
- [x] Phase 5: Outputs and Gallery Review (2/2 plans)

</details>

### 🚧 v1.1 UX and QOL (In Progress)

- [ ] Phase 6: UI Refresh and Interaction Foundation (planned)
- [ ] Phase 7: Workflow Presets and Input Usability (planned)
- [ ] Phase 8: Jobs and Output Review Quality of Life (planned)

## Phase Details

### Phase 6: UI Refresh and Interaction Foundation

**Goal**: Users get a coherent, modern, and accessible interface across Setup/Input/Jobs/Output before additional QOL feature expansion.
**Depends on**: Phase 5
**Requirements**: UI-01, UI-02, UI-03, UI-04
**Success Criteria**:

1. Visual hierarchy, spacing, and typography are consistent across all tabs.
2. Primary/secondary/destructive actions are distinguishable at a glance.
3. Desktop and mobile layouts preserve core actions without clipping or overlap.
4. Key controls expose clear focus/hover/active/disabled/error states.

### Phase 7: Workflow Presets and Input Usability

**Goal**: Users can save reusable workflow presets and reset input states faster with clear changed-state visibility.
**Depends on**: Phase 6
**Requirements**: PRESET-01, PRESET-02, PRESET-03, INPUT-01, INPUT-02, INPUT-03
**Success Criteria**:

1. User can create, rename, and delete named presets from current workflow + draft values.
2. User can apply a compatible preset in one action without manual field-by-field re-entry.
3. User can reset all inputs or a single category to template defaults.
4. User can clearly identify changed fields and receive actionable run-blocking validation feedback.

### Phase 8: Jobs and Output Review Quality of Life

**Goal**: Users can triage jobs and review outputs faster with stronger filters, lineage clarity, and metadata annotations.
**Depends on**: Phase 7
**Requirements**: JOBS-01, JOBS-02, JOBS-03, OUTUX-01, OUTUX-02, OUTUX-03
**Success Criteria**:

1. User can search and filter jobs by workflow name and lifecycle status together.
2. User can identify rerun lineage relationships directly from jobs view.
3. User can pin/favorite important jobs for faster retrieval.
4. User can add tags/notes and filter outputs by workflow, tags, and recency while keeping provenance visible inline.

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
| ----- | --------- | -------------- | ------ | --------- |
| 1. Access and Proxy Boundary | v1.0 | 5/5 | Complete | 2026-05-23 |
| 2. Workflow Import and Template Reuse | v1.0 | 2/2 | Complete | 2026-05-23 |
| 3. Dynamic Input Editing | v1.0 | 2/2 | Complete | 2026-05-23 |
| 4. Job Lifecycle and Run Management | v1.0 | 3/3 | Complete | 2026-05-24 |
| 5. Outputs and Gallery Review | v1.0 | 2/2 | Complete | 2026-05-24 |
| 6. UI Refresh and Interaction Foundation | v1.1 | 0/0 | Not started | - |
| 7. Workflow Presets and Input Usability | v1.1 | 0/0 | Not started | - |
| 8. Jobs and Output Review Quality of Life | v1.1 | 0/0 | Not started | - |
