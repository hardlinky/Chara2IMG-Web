# Phase 4: Job Lifecycle and Run Management - Research

**Researched:** 2026-05-24
**Domain:** Runpod job lifecycle orchestration in a React + TypeScript app with Hono proxy
**Confidence:** HIGH

## Summary

Phase 4 can be planned as a client-side orchestration phase, not a backend feature phase. The server already forwards `/run`, `/status`, `/cancel`, `/retry`, and `/purge-queue` with schema validation and key redaction, and the client already builds valid Runpod `input` payloads from workflow drafts. The missing work is a typed recent-jobs domain model on the client, deterministic polling with terminal-state rules, and UX flows for rerun/load-inputs/remove/history.

The best fit for this repository is to keep lifecycle semantics in shared typed contracts, implement recent history in Dexie (matching existing workflow/input persistence style), and expose orchestration through a dedicated client hook (`useRecentJobs`) consumed by `App.tsx`. Do not hand-roll ad hoc polling loops in UI components.

**Primary recommendation:** Build a typed `RecentJobRecord` + `JobStatusSnapshot` contract first, then implement a single polling orchestrator hook and finally add rerun/load/remove/history UX on top.

## 1) Current Codebase Readiness and Gaps

### Readiness Snapshot

| Requirement | Current state | Readiness |
| ----------- | ------------- | --------- |
| JOBS-01 submit job | `runViaProxy` exists and `App.tsx` already submits built payloads | Partially ready |
| JOBS-02 status per job | `statusViaProxy` exists; server uses path-based `GET /status/{id}` | Partially ready |
| JOBS-03 poll until terminal/timeout | No recent-jobs model and no polling scheduler | Gap |
| JOBS-04 cancel job | Server route exists, but client has no cancel call or UI flow | Gap |
| JOBS-05 rerun prior job | Server supports retry, but no job history and no rerun action wiring | Gap |
| JOBS-06 load prior inputs | Dynamic editor has draft state, but no external "apply saved draft" pathway | Gap |
| JOBS-07 remove visible job | No recent-jobs list/store exists | Gap |
| JOBS-08 maintain recent history | Existing Dexie patterns exist, but no jobs store/table yet | Gap |

### What Is Already Strong

- End-to-end proxy boundary is tested for run and status path semantics.
- Shared typed workflow/input modules already produce deterministic run payloads.
- Browser persistence pattern (Dexie + typed table shapes) is already established.

### Concrete Gaps to Plan Explicitly

- Missing shared contracts for job snapshots, terminal states, and persisted input provenance.
- Missing client API wrappers for `cancel` and `retry` operations.
- Missing centralized polling orchestration with cleanup on unmount/tab changes.
- Missing bridge to load job-saved draft values back into active input editor.
- Missing job history retention policy (count cap + pruning strategy).

## Standard Stack

Use current repo stack and patterns; no new framework is required for Phase 4.

### Core

| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| React | 19.x | Jobs list UI + orchestration hooks | Existing app foundation and hook style already used in features. |
| TypeScript | 5.8+ | Shared contracts + strict state transitions | Keeps lifecycle flows and payload provenance type-safe. |
| Dexie | 4.4.x | Recent jobs persistence and pruning | Existing repository pattern for workflow and input persistence. |
| Zod | 4.x | Runtime validation of proxy payload envelopes | Existing schema approach on server; keep boundary strict. |

### Supporting

| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| Runpod queue operations (`/run`, `/status`, `/cancel`, `/retry`) | Current docs | Job lifecycle backend contract | Use as canonical operation/state source. |
| Vitest | 2.x | Unit + integration tests for lifecycle logic | Use for deterministic polling/timeout/cancel/retry tests. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| ---------- | --------- | -------- |
| Dexie jobs table | In-memory only state | Fails JOBS-08 across reloads and loses auditability. |
| Per-component `setInterval` polling | Central polling hook/service | Component-local timers create duplicate calls and race conditions. |
| Custom job retry implementation | Runpod `/retry` | `/retry` preserves original job ID and input on backend semantics. |

**Installation:**

```bash
# Existing dependencies are sufficient
npm install
```

## 2) Recommended Architecture and Patterns

### Recommended Project Structure

```text
src/
├── shared/
│   └── contracts/
│       └── jobs.ts                    # Job record, snapshot, terminal-state types
├── client/
│   ├── lib/
│   │   ├── api/
│   │   │   └── runpodProxyClient.ts   # add cancel/retry proxy clients
│   │   └── recentJobsStorage.ts       # Dexie jobs table + prune helpers
│   └── features/
│       └── jobs/
│           ├── useRecentJobs.ts       # submit/poll/cancel/rerun orchestration
│           ├── RecentJobsPanel.tsx    # list rendering + actions
│           └── jobStatus.ts           # terminal-state guards, timeout helpers
└── tests/
    ├── client/
    │   ├── recentJobsStorage.test.ts
    │   ├── useRecentJobs.test.tsx
    │   └── jobPolling.test.ts
    └── shared/
        └── jobContracts.test.ts
```

### Pattern A: Recent-Jobs Store (JOBS-01, JOBS-07, JOBS-08)

**Use one persisted record per job** with immutable submission provenance plus mutable lifecycle snapshot.

Recommended fields:

- `jobId`, `endpointId`, `templateFingerprint`
- `submittedAt`, `lastCheckedAt`, `finishedAt?`
- `status`, `isTerminal`, `terminalReason?`
- `savedDraftValues` (for load-inputs/rerun), `savedPayloadInput`
- `lastResponse` (redacted/safe), `lastError?`
- `hiddenAt?` for remove-from-visible-list without deleting audit/history

Policy:

- Keep latest `N` records visible (recommend 25) and prune oldest hidden/terminal rows beyond cap.
- Store by `jobId` primary key and index by `submittedAt` + `hiddenAt`.

### Pattern B: Polling Model (JOBS-02, JOBS-03)

Use one orchestrator hook managing a map of active poll loops keyed by `jobId`.

Polling behavior:

- Start polling immediately after successful submit.
- Poll only non-terminal jobs.
- Interval strategy: fixed 2 seconds for first 30 seconds, then 5 seconds.
- Backoff on transient errors/429: exponential up to 15 seconds.
- Stop on terminal status or timeout classification.

Terminal states to treat as stop conditions:

- `COMPLETED`, `FAILED`, `CANCELLED`, `TIMED_OUT`

Non-terminal states:

- `IN_QUEUE`, `IN_PROGRESS`

### Pattern C: Timeout Semantics (JOBS-03)

Model two timeout layers explicitly:

- **Runpod timeout/TTL semantics**: backend can return `TIMED_OUT`, or status can become `404` after TTL expiry.
- **Client observation timeout**: guard against indefinite polling (recommend 30 minutes default).

Rules:

- If status endpoint returns `404` for previously known job, classify as `EXPIRED_OR_NOT_FOUND` terminal reason, not generic network error.
- Keep a distinct `terminalReason` enum to separate Runpod terminal status from client observation timeout.

### Pattern D: Cancel/Rerun/Load-Inputs Flows (JOBS-04, JOBS-05, JOBS-06)

Cancel:

- Action allowed only in non-terminal states.
- Optimistically set `status= CANCELLING` (local-only display state), then call `/cancel`.
- On success, mark `CANCELLED` terminal immediately and stop polling.

Rerun:

- Prefer "rerun as new submission" using stored `savedPayloadInput` via `/run` to create a new job row.
- Keep `/retry` as secondary action for failed/timed-out job recovery with same job ID semantics.

Load inputs:

- Add API to dynamic input editor hook to replace current draft with `savedDraftValues` from selected job.
- Require matching `templateFingerprint` before applying; otherwise show "template mismatch" warning and block apply.

Remove visible job:

- Soft-remove via `hiddenAt` timestamp; keep in store for history and diagnostics.
- Visible list filters `hiddenAt == null`; optional history view can include hidden rows.

## 3) Risks and Mitigation

### Risk 1: Polling storms / duplicate timers

- **Cause:** multiple components creating independent polling loops.
- **Mitigation:** single `useRecentJobs` owner with per-job loop registry and cleanup on unmount.

### Risk 2: Wrong terminal classification

- **Cause:** treating unknown status or 404 as transient forever.
- **Mitigation:** explicit status enum guard + fallback terminal reason `EXPIRED_OR_NOT_FOUND` after known-job 404.

### Risk 3: Rerun/load uses stale or incompatible inputs

- **Cause:** applying saved drafts to different workflow template.
- **Mitigation:** persist `templateFingerprint` and enforce exact match before load/rerun with user-facing mismatch warning.

### Risk 4: History growth degrades UX and storage

- **Cause:** unbounded jobs table.
- **Mitigation:** capped retention (recommend 100 total, 25 visible), prune oldest terminal hidden jobs first.

### Risk 5: Retry semantics confusion (`/retry` vs new `/run`)

- **Cause:** mixing product rerun expectation with backend retry behavior.
- **Mitigation:** label actions separately in UI: `Rerun (new job)` and `Retry failed job`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Recent history persistence | custom JSON blobs in `localStorage` | Dexie jobs table with indexes | Consistent with existing repo persistence and supports pruning/querying. |
| Lifecycle status parsing | string checks scattered in UI | shared status guard helpers | Prevents inconsistent terminal detection across components. |
| Job retry behavior | resubmit guess logic for failed jobs | Runpod `/retry` when appropriate | Aligns with documented backend semantics and ID behavior. |

**Key insight:** most Phase 4 bugs will come from state-machine drift, not API forwarding. Centralize lifecycle semantics in shared typed helpers.

## Code Examples

### Runpod Terminal State Guard

```typescript
export const TERMINAL_RUNPOD_STATUSES = ["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"] as const;

export function isTerminalRunpodStatus(status: string): boolean {
  return TERMINAL_RUNPOD_STATUSES.includes(status as (typeof TERMINAL_RUNPOD_STATUSES)[number]);
}
```

Source: https://docs.runpod.io/serverless/endpoints/operation-reference

### Poll-once Primitive

```typescript
async function pollJobOnce(jobId: string): Promise<void> {
  const response = await statusViaProxy({ endpointId, apiKey, id: jobId });
  const status = String((response as { status?: unknown }).status ?? "UNKNOWN");
  updateJobSnapshot(jobId, response, status);
}
```

Source: repository pattern in `runpodProxyClient.ts` + `RunpodProxySmoke.tsx`

## 4) Proposed Plan Split (Exactly 3 Plans)

### 04-01: Job Submission Contracts and Recent-Jobs Persistence

**Depends on:** Phase 3 completion (already done)

**Delivers:**

- Shared typed job contracts and status helpers.
- Dexie recent-jobs store with retention/prune policy.
- Submit flow writes job record with saved draft/payload provenance.

**Likely files:**

- `src/shared/contracts/jobs.ts` (new)
- `src/client/lib/recentJobsStorage.ts` (new)
- `src/client/lib/api/runpodProxyClient.ts` (extend types if needed)
- `src/client/App.tsx` (wire submit into jobs domain)
- `tests/client/recentJobsStorage.test.ts` (new)
- `tests/shared/jobContracts.test.ts` (new)

### 04-02: Polling, Timeout Semantics, and Cancel Actions

**Depends on:** 04-01

**Delivers:**

- `useRecentJobs` orchestration hook with per-job polling loops and cleanup.
- Terminal-state + timeout classification.
- Cancel operation wiring and UI action gating.

**Likely files:**

- `src/client/features/jobs/useRecentJobs.ts` (new)
- `src/client/features/jobs/jobStatus.ts` (new)
- `src/client/lib/api/runpodProxyClient.ts` (add `cancelViaProxy`)
- `src/client/App.tsx` (consume polling/cancel state)
- `tests/client/jobPolling.test.ts` (new)
- `tests/client/useRecentJobs.test.tsx` (new)

### 04-03: Rerun, Load-Inputs, Remove-Visible, and History UX

**Depends on:** 04-02

**Delivers:**

- Rerun-as-new-job and optional retry-failed action.
- Load prior inputs into dynamic editor with fingerprint compatibility check.
- Remove-visible (soft hide) + recent-history panel behavior.

**Likely files:**

- `src/client/features/jobs/RecentJobsPanel.tsx` (new)
- `src/client/features/inputs/useDynamicInputEditor.ts` (add apply-draft API)
- `src/client/App.tsx` (connect load-inputs/rerun/remove actions)
- `src/client/lib/api/runpodProxyClient.ts` (add `retryViaProxy`)
- `tests/client/useRecentJobs.test.tsx` (extend)
- `tests/client/dynamicInputEditor.test.tsx` (extend for load-inputs)

## 5) Verification Commands and Checks

### Automated Commands

```bash
npm run typecheck
npm run test
npm run test -- tests/server/runpodProxy.test.ts
npm run test -- tests/client/useRecentJobs.test.tsx tests/client/jobPolling.test.ts tests/client/recentJobsStorage.test.ts
```

### Behavioral Checks

1. Submit run from dynamic input editor and confirm job appears in recent jobs immediately.
2. Confirm polling transitions through queue/in-progress to terminal and then stops network calls.
3. Cancel queued/running job and confirm terminal `CANCELLED` state and disabled polling.
4. Rerun prior job and verify a new job row is created with copied inputs.
5. Load prior job inputs and verify input editor values update only when template fingerprint matches.
6. Remove visible job and confirm it disappears from main list but remains in history storage.

## State of the Art

| Old approach | Current approach | When changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| Component-local timers for API polling | Central orchestration hook per domain | Common modern React pattern | Avoids duplicate network calls and leaks. |
| Stateless run response rendering | Persisted recent-jobs timeline with provenance | Local-first web app pattern | Enables rerun/load-input/history UX. |
| Unbounded status refresh loops | Explicit terminal + timeout stop conditions | Current Runpod operation semantics | Prevents infinite polling and quota churn. |

## Open Questions

1. Should rerun use `/run` only, or expose both `/run` and `/retry` in UI by default?
   - Recommendation: expose both with clear labels; product rerun maps to `/run`, recovery maps to `/retry`.
2. Is history cap 25 visible / 100 total acceptable for invited-user normal usage?
   - Recommendation: start with those defaults and make them constants in one module.
3. Should status polling continue when page tab is hidden?
   - Recommendation: pause hidden-tab polling (except active just-submitted jobs) to reduce noise.

## Sources

### Primary (HIGH confidence)

- https://docs.runpod.io/serverless/endpoints/send-requests
- https://docs.runpod.io/serverless/endpoints/operation-reference
- Repository files inspected:
  - `src/server/routes/runpodProxy.ts`
  - `src/server/lib/runpodClient.ts`
  - `src/client/lib/api/runpodProxyClient.ts`
  - `src/client/App.tsx`
  - `src/client/features/inputs/useDynamicInputEditor.ts`
  - `src/client/lib/inputEditorStorage.ts`
  - `tests/server/runpodProxy.test.ts`

### Secondary (MEDIUM confidence)

- https://docs.runpod.io/llms.txt (documentation index for endpoint docs discovery)

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**

- Current readiness/gaps: HIGH - directly inspected from repository state.
- Architecture patterns: HIGH - aligned with existing app stack and Runpod operation docs.
- Risks/mitigation: MEDIUM-HIGH - grounded in known polling/state-machine failure modes.

**Research date:** 2026-05-24
**Valid until:** 2026-06-23
