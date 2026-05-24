# Phase 4: Job Lifecycle and Run Management - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement in-app job lifecycle management for Runpod runs: recent jobs listing, status updates, cancel/rerun/load-inputs/remove flows, and practical recent-history behavior within Phase 4 requirements.

</domain>

<decisions>
## Implementation Decisions

### Recent Jobs List Model

- Keep strict newest-submitted-first ordering for the list.
- Show these minimum row fields: full job ID, status, and submitted time.
- Status should render as colored badge plus text.
- Rows stay compact (no expandable detail panel).
- Time display should be relative time, with absolute timestamp on hover.
- Terminal jobs remain in the same mixed list (no separate active/finished sections).
- Empty state text: "No recent jobs yet".
- Add proper pagination with numbered pages at the bottom plus Prev/Next controls.
- When a user is on page 2+ and submits a new job, auto-jump to page 1.
- Include status filtering in this phase.
- Filter control should be a dropdown near the list title.
- Filter default value should be "All".
- Persist last-used filter across refresh, but reset page index to page 1.
- Remove-from-visible is one-way in this phase (no restore UI).
- Removed jobs remain retained internally for 24 hours, then auto-delete.
- Auto-refresh active jobs only; stop refreshing terminal jobs.
- Poll active jobs every 5 seconds.
- On temporary polling failure, keep last-known status, show a warning indicator, and continue retrying.
- For completed rows, show execution time when available.
- For failed/cancelled/timed-out rows, show a brief failure-reason snippet.

### Copilot's Discretion

- Choose page size for pagination.

</decisions>

<specifics>
## Specific Ideas

- Prioritize simple scanability in the list over row-level controls and expansion.
- Job ID should be displayed in full and not truncated.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

_Phase: 04-job-lifecycle-and-run-management_
_Context gathered: 2026-05-24_