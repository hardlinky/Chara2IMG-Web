# Codebase Concerns

**Analysis Date:** 2026-06-17

## Security Considerations

**Admin key verification uses non-constant-time comparison:**
- Risk: Timing oracle attack on admin authentication
- Files: `src/server/routes/admin.ts` (line 21)
- Current mitigation: None — `parsed.data.key === getAdminPasskey()` uses string equality
- Contrast: Invite verification correctly uses `timingSafeEqual` in `src/server/security/invite.ts`
- Recommendation: Wrap admin key comparison in `timingSafeEqual` (matching invite pattern)

**Admin passkey logged to stdout via `console.log`:**
- Risk: Secret exposed in server logs, process managers (PM2/systemd), or log aggregators
- Files: `src/server/security/adminPasskey.ts` (line 26), `src/server/index.ts` (line 70)
- Current mitigation: None — key is printed in full on every server start
- Recommendation: Log only a redacted prefix (first 4 chars + `****`) or omit entirely when set via env var

**Empty string fallback for cookie signing secret:**
- Risk: If `COOKIE_SECRET` env var is not set, all signed cookies use `""` as the HMAC key — trivially forgeable
- Files: `src/server/middleware/session.ts` (line 17)
- Current mitigation: None
- Recommendation: Throw or warn loudly at startup when `COOKIE_SECRET` is missing; document it as required

**No rate limiting on authentication endpoints:**
- Risk: Brute-force attacks on `/api/access/verify-invite` and `/api/admin/verify-key`
- Files: `src/server/routes/access.ts`, `src/server/routes/admin.ts`
- Current mitigation: None
- Recommendation: Add per-IP rate limiting middleware (e.g., `hono-rate-limiter`) to auth routes

**Self-update endpoint requires only invite session (not admin):**
- Risk: Any invited user can trigger `git pull + npm install + npm run build` on the server
- Files: `src/server/routes/system.ts` (line 77 — uses `requireInvitedSession`, not `requireAdminSession`)
- Current mitigation: `ALLOW_SELF_UPDATE` env flag (default: `true`)
- Recommendation: Change to `requireAdminSession` guard, or at minimum default `ALLOW_SELF_UPDATE=false`

**RunPod API key stored in localStorage:**
- Risk: Any JS running on the same origin (XSS, browser extensions) can read the key
- Files: `src/client/lib/runpodKeyStorage.ts`
- Current mitigation: User opt-in "remember on this browser" toggle; server-side key overrides client storage
- Recommendation: Prefer server-managed key (`RUNPOD_API_KEY` env var) in production; document localStorage risk for self-hosted deployments

## Tech Debt

**Cross-tab communication via global window mutation:**
- Issue: `OutputsTab` assigns `gallery.openJobOutputs` to `window.__openJobOutputs` at render time, and `App` reads it via `setTimeout` with two `@ts-ignore` suppressions
- Files: `src/client/features/outputs/OutputsTab.tsx` (lines 238–243), `src/client/App.tsx` (lines 586–592)
- Impact: Fragile timing dependency; breaks if `OutputsTab` unmounts or re-renders before the timeout fires; bypasses React's event and ref model entirely
- Fix approach: Pass `openJobOutputs` as a callback ref up through `OutputsTab` props or use a shared React context/ref

**`@ts-ignore` suppressions indicating unresolved type gaps:**
- Files: `src/client/features/outputs/OutputsTab.tsx` (line 240), `src/client/App.tsx` (line 589)
- Both are caused by the `window.__openJobOutputs` hack described above
- Fix approach: Resolves automatically when the cross-tab hack is replaced

**`eslint-disable-next-line react-hooks/exhaustive-deps` suppression:**
- Files: `src/client/features/inputs/DynamicInputEditor.tsx` (line 419)
- Impact: Potential stale closure — the suppressed `useEffect` may not re-run when referenced values change
- Fix approach: Audit the suppressed effect; restructure dependencies or use a `useRef` pattern if intentional

**Server module importing from client lib:**
- Issue: `src/server/lib/recentJobsStore.ts` imports `extractRunpodOutputImages` from `../../client/lib/runpodOutputImage`
- Impact: Bundles client-side utility into the server; creates build coupling between client and server trees; makes it harder to separate concerns or tree-shake
- Fix approach: Move `extractRunpodOutputImages` (or the parts used by the server) to `src/shared/`

**`structuredClone` availability guard is now unnecessary:**
- Files: `src/server/lib/recentJobsStore.ts` (lines 110–114), `src/client/lib/recentJobsStorage.ts` (lines 108–112)
- Both check `typeof globalThis.structuredClone === "function"` and fall back to `JSON.parse(JSON.stringify(...))` 
- `structuredClone` is available in Node 17+ and all modern browsers targeted by this project
- Fix approach: Remove the polyfill guards; use `structuredClone` directly

## Performance Bottlenecks

**`writeFileSync` on every Runpod job state change (blocks event loop):**
- Problem: `persistSuccessfulStates()` calls `writeFileSync` synchronously on every terminal job state write
- Files: `src/server/lib/runpodJobStateStore.ts` (line 59)
- Cause: Synchronous I/O blocks Node.js event loop for the duration of the file write
- Improvement path: Switch to async `writeFile` with debounce/coalescing (matching the pattern used in `recentJobsStore.ts`)

**No eviction ceiling on in-memory Runpod job state store:**
- Problem: The `store` Map in `runpodJobStateStore.ts` accumulates non-terminal job states indefinitely; `removeUnknownRunpodJobStates` is only called from `status-batch` requests
- Files: `src/server/lib/runpodJobStateStore.ts`
- Cause: No time-based TTL or max-size policy for non-terminal entries
- Improvement path: Add a staleness check (e.g., `updatedAt` older than 24 h) during `removeUnknownRunpodJobStates` or in the tracker tick

**Background tracker interval never stops:**
- Problem: Once `ensureTrackerRunning()` starts the `setInterval`, it continues indefinitely even when `trackedJobs` is empty
- Files: `src/server/lib/runpodJobTracker.ts` (lines 54–57)
- Cause: `clearInterval` is never called after the last job is removed
- Improvement path: Clear the interval in `runTrackerTick` when `trackedJobs.size === 0`

## Fragile Areas

**File store writes are not atomic (data corruption risk on crash):**
- Files: `src/server/lib/recentJobsStore.ts` (`writeStore`, line 311), `src/server/lib/pinnedImageStorageStats.ts` (`writeFile` calls on manifest files)
- Why fragile: Direct `writeFile` to the target path means a crash mid-write leaves a truncated/corrupt JSON file; next read returns empty store
- Safe modification: Write to a `.tmp` file first, then `rename` atomically (or use `write-file-atomic` npm package)
- Test coverage: No test covering partial-write recovery

**`recentJobsStore.ts` and `pinnedImageStorageStats.ts` have no write serialization:**
- Files: `src/server/lib/recentJobsStore.ts`, `src/server/lib/pinnedImageStorageStats.ts`
- Why fragile: Concurrent requests (e.g., two simultaneous image backups) each read-modify-write the manifest independently, causing lost updates (last write wins)
- Safe modification: Add a per-file async mutex or queue (e.g., `async-mutex` npm package) to serialize writes
- Test coverage: No concurrent-write test

**`DynamicInputEditor.tsx` is 920 lines — highest complexity risk:**
- Files: `src/client/features/inputs/DynamicInputEditor.tsx`
- Why fragile: Single file mixes rendering, section collapsing, scroll-following, and run coordination; any change risks unintended side effects across concerns
- Safe modification: Extract sub-components (`InputSectionList`, `CollapseController`) before adding new features
- Test coverage: `tests/client/dynamicInputEditor.test.tsx` exists but only covers run validation path

**`useRecentJobs.ts` is 805 lines — core polling logic is opaque:**
- Files: `src/client/features/jobs/useRecentJobs.ts`
- Why fragile: Contains job submission, polling, output cluster management, pin toggling, and rerun logic in one hook; multiple `setInterval`s with interdependent state
- Safe modification: Do not add more polling logic to this file; extract sub-hooks first
- Test coverage: `tests/client/useRecentJobs.test.tsx` and `tests/client/jobPolling.test.ts` exist

**`pinnedImages.ts` route file is 836 lines with 8+ routes:**
- Files: `src/server/routes/pinnedImages.ts`
- Why fragile: All pinned image routes (backup, release, reconcile, prune, archive, export) in one file; adding a new route increases the risk of accidentally reusing a variable or skipping auth middleware
- Safe modification: Split into `pinnedImages/backup.ts`, `pinnedImages/manage.ts`, etc.

## Test Coverage Gaps

**No tests for cookie secret missing at runtime:**
- What's not tested: Behavior when `COOKIE_SECRET` is undefined (empty string signing secret)
- Files: `src/server/middleware/session.ts`
- Risk: A misconfigured deployment silently accepts forged session cookies
- Priority: High

**No tests for concurrent manifest write races:**
- What's not tested: Two simultaneous backup requests modifying `manifest.v1.json`
- Files: `src/server/lib/pinnedImageStorageStats.ts`, `src/server/routes/pinnedImages.ts`
- Risk: Lost manifest entries under load
- Priority: Medium

**No tests for `system.ts` self-update endpoint:**
- What's not tested: Auth guard, `ALLOW_SELF_UPDATE` flag, command execution paths
- Files: `src/server/routes/system.ts`
- Risk: Auth regression could expose shell execution to non-admin users
- Priority: High

**No server-side tests for `recentJobsStore.ts` write corruption recovery:**
- What's not tested: Behavior when `LIVE_STORE_FILE` contains truncated/invalid JSON
- Files: `src/server/lib/recentJobsStore.ts`
- Risk: A crash mid-write silently resets job history to empty on next server start
- Priority: Medium

---

*Concerns audit: 2026-06-17*
