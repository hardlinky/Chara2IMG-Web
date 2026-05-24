---
phase: 04-job-lifecycle-and-run-management
plan: 01
subsystem:
  jobs-storage
tags: [jobs, dexie, contracts, submission]
requires:
  - phase: 03-dynamic-input-editing
    provides: Canonical workflow templates, dynamic input drafts, and run-ready payloads
provides:
  - Typed recent-job contracts for lifecycle state and persisted provenance
  - Dexie-backed recent-jobs storage with one-way hide and retention pruning
  - Run submission persistence that records job metadata immediately after success
affects: [phase-4, job-polling, rerun, history]
tech-stack:
  added: []
  patterns: [typed lifecycle contracts, Dexie persistence, provenance snapshots]
key-files:
  created: [src/shared/contracts/jobs.ts, src/client/lib/recentJobsStorage.ts, src/client/lib/jobSubmission.ts, tests/shared/jobContracts.test.ts, tests/client/recentJobsStorage.test.ts, tests/client/appJobSubmission.test.tsx]
  modified: [src/client/lib/api/runpodProxyClient.ts, src/client/features/inputs/DynamicInputEditor.tsx, src/client/App.tsx]
key-decisions:
  - Store both workflow draft provenance and submitted Runpod input with each recent job
  - Keep hidden jobs one-way and auto-prune them after 24 hours
  - Treat a successful submit as the moment a recent job becomes visible in app state
duration: 55min
completed: 2026-05-24
---

# Phase 4 Plan 01 Summary

Typed recent-job contracts, Dexie-backed storage, and submission persistence for Runpod runs.

## Performance

- **Duration:** 55 min
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Added shared lifecycle contracts for job status, terminal reasons, retention limits, and provenance.
- Built a browser-persistent recent-jobs store with newest-first listing, one-way hide, and 24-hour retention pruning.
- Wired run submission to persist job provenance immediately after successful proxy submission.
- Added tests covering terminal classification, storage retention, and successful/failed submission persistence.

## Verification Evidence

- `npm test -- tests/shared/jobContracts.test.ts tests/client/recentJobsStorage.test.ts tests/client/appJobSubmission.test.tsx`
- `npm run build`

## Files Created/Modified

- `src/shared/contracts/jobs.ts` - typed recent-job contract surface
- `src/client/lib/recentJobsStorage.ts` - Dexie-backed recent-job persistence
- `src/client/lib/jobSubmission.ts` - run submission persistence helper
- `src/client/lib/api/runpodProxyClient.ts` - typed proxy responses and error surface
- `src/client/features/inputs/DynamicInputEditor.tsx` - exposed run snapshot metadata to the App
- `src/client/App.tsx` - persisted recent jobs from the run path

## Decisions Made

- Store job provenance alongside the submitted input payload for later rerun/load flows.
- Keep hidden jobs one-way and auto-prune them after 24 hours.

## Issues Encountered

IndexedDB test harness had to be enabled for the Dexie-backed storage tests.

---

_Phase: 04-job-lifecycle-and-run-management_
_Plan: 01_
_Completed: 2026-05-24_
