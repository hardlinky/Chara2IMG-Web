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

- [ ] Phase 6: Workflow Presets and Input Usability (planned)
- [ ] Phase 7: Jobs Browsing and Rerun Clarity (planned)
- [ ] Phase 8: Output Metadata, Tags, and Gallery Filtering (planned)

## Phase Details

### Phase 6: Workflow Presets and Input Usability

**Goal**: Users can save reusable workflow presets and reset input states faster with clear changed-state visibility.
**Depends on**: Phase 5
**Requirements**: PRESET-01, PRESET-02, PRESET-03, INPUT-01, INPUT-02
**Success Criteria**:

1. User can create, rename, and delete named presets from current workflow + draft values.
2. User can apply a compatible preset in one action without manual field-by-field re-entry.
3. User can reset all inputs or a single category to template defaults.
4. User can clearly identify fields changed since last successful run.

### Phase 7: Jobs Browsing and Rerun Clarity

**Goal**: Users can triage and revisit jobs faster with stronger filtering and rerun lineage context.
**Depends on**: Phase 4
**Requirements**: INPUT-03, JOBS-01, JOBS-02, JOBS-03
**Success Criteria**:

1. User can search and filter jobs by workflow name and lifecycle status together.
2. User can identify rerun lineage relationships directly from jobs view.
3. User can pin/favorite important jobs for faster retrieval.
4. Validation errors surfaced during rerun/load flows are actionable and field-targeted.

### Phase 8: Output Metadata, Tags, and Gallery Filtering

**Goal**: Users can annotate and filter outputs with richer context while staying in gallery-first workflows.
**Depends on**: Phase 5
**Requirements**: OUTUX-01, OUTUX-02, OUTUX-03
**Success Criteria**:

1. User can add and edit notes/tags for completed job output groups.
2. User can filter output gallery by workflow name, tags, and recency.
3. User can view compact provenance/metadata details inline without leaving gallery flow.

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
| ----- | --------- | -------------- | ------ | --------- |
| 1. Access and Proxy Boundary | v1.0 | 5/5 | Complete | 2026-05-23 |
| 2. Workflow Import and Template Reuse | v1.0 | 2/2 | Complete | 2026-05-23 |
| 3. Dynamic Input Editing | v1.0 | 2/2 | Complete | 2026-05-23 |
| 4. Job Lifecycle and Run Management | v1.0 | 3/3 | Complete | 2026-05-24 |
| 5. Outputs and Gallery Review | v1.0 | 2/2 | Complete | 2026-05-24 |
| 6. Workflow Presets and Input Usability | v1.1 | 0/0 | Not started | - |
| 7. Jobs Browsing and Rerun Clarity | v1.1 | 0/0 | Not started | - |
| 8. Output Metadata, Tags, and Gallery Filtering | v1.1 | 0/0 | Not started | - |
