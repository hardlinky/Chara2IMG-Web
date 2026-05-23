# Pitfalls Research

**Domain:** Web client for serverless ComfyUI jobs with Runpod BYOK key handling
**Researched:** 2026-05-23
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Treating Runpod jobs like normal HTTP requests

**What goes wrong:**
Teams model generation as a single request-response action, then discover that queued jobs, TTL expiry, result retention windows, cancel semantics, and transient 404/429 behavior do not fit that mental model. Users see jobs disappear, cancel appears unreliable, and completed results vanish before the gallery stores them.

**Why it happens:**
Serverless GPU inference looks like an API call from the browser, but Runpod's queue-based endpoints are job systems with explicit `/run`, `/status`, `/cancel`, TTL, and retention behavior. Teams often design the UI before designing the job state machine.

**How to avoid:**
Design around an explicit client and proxy job lifecycle from day one: `queued`, `running`, `completed`, `failed`, `cancel_requested`, `cancelled`, `expired`, and `lost_result`. Use async `/run`, poll `/status` with backoff, store result metadata immediately on completion, and surface TTL and retention as product constraints. Treat `404` after long queue time as possible TTL expiry, not only as an invalid job ID.

**Warning signs:**
- Job rows only track `pending` and `done`.
- Cancel is wired as a fire-and-forget button with no follow-up state.
- The gallery reads directly from live Runpod status payloads instead of persisting a normalized job record.
- Polling is fixed-interval with no backoff or jitter.

**Phase to address:**
Phase 3: Job lifecycle and state orchestration.

---

### Pitfall 2: Treating browser-local key storage as secure secret storage

**What goes wrong:**
The BYOK feature ships quickly by dropping the Runpod API key into `localStorage`, then later every in-origin script, XSS bug, debug logger, or browser profile compromise can expose it. Teams also accidentally forward keys into server logs, error reports, analytics, or persisted server sessions.

**Why it happens:**
`localStorage` is easy and persistent, so it gets mistaken for a safe vault. It is not. It is origin-scoped storage accessible to JavaScript and shared across the whole origin. The convenience of a "remember my key" toggle masks the fact that this is an exposure decision, not a security control.

**How to avoid:**
Make the default non-persistent and explicit: paste key for current session, with a separate opt-in remember toggle that clearly states the risk. If remembered, store only client-side and never persist server-side. Keep the proxy stateless regarding keys: accept the key per request, use it only to call Runpod, redact it from logs, and disable analytics/error breadcrumbs on secret-bearing requests. Harden the app against XSS with strict output encoding, CSP, dependency review, and no untrusted HTML rendering. If persistence is kept, document it as convenience storage, not secure storage.

**Warning signs:**
- API keys appear in network replay tools, server logs, telemetry, or exception traces.
- The app auto-restores a key without showing whether persistence is enabled.
- The same origin hosts unrelated tools or admin pages.
- The remember option is implemented before CSP and XSS hardening.

**Phase to address:**
Phase 1: Security foundation and minimal proxy design.

---

### Pitfall 3: Assuming ComfyUI workflow JSON is stable, small, and easy to parse

**What goes wrong:**
Teams build a narrow parser around one or two exported workflows, then real user workflows fail because node IDs can be strings or integers, optional properties vary, titles are inconsistent, widget shapes differ, and schema versions drift. Input extraction and "load inputs from job" stop being trustworthy.

**Why it happens:**
ComfyUI workflow JSON looks like ordinary JSON, so teams skip schema-aware validation and overfit to current sample files or WPF-era assumptions. The migration focus on parity can also hide differences between legacy parsing heuristics and the current ComfyUI workflow schema.

**How to avoid:**
Validate imported workflows against the published workflow schema where possible, then apply a second application-level validator for Chara2Img conventions such as `[Input]` and `[Input#]` title handling. Build a tolerant parser that normalizes IDs, titles, widget values, and node metadata before UI generation. Keep a regression corpus of real workflows from the WPF app and snapshot the extracted inputs, applied prompt payload, and rerun/load-input behavior.

**Warning signs:**
- Parser logic depends on exact property order or a single export format.
- Workflow import success is defined as "JSON parsed" rather than "inputs extracted correctly".
- There are no fixture tests for multiple workflow versions and malformed-but-common variants.
- Support issues require manual JSON edits to make workflows import.

**Phase to address:**
Phase 2: Workflow import, normalization, and parity verification.

---

### Pitfall 4: Letting proxy and client payloads balloon with base64 images

**What goes wrong:**
Outputs work in demos, but production tabs become memory-heavy, rerenders get slow, and the lightweight pod wastes CPU and bandwidth proxying large base64 payloads repeatedly. Gallery views start duplicating decoded image data across state, cache, and DOM.

**Why it happens:**
Base64 is convenient for the first happy path. Teams keep passing it through JSON, storing it inline in job lists, and rendering it directly in component state because it avoids thinking about object URLs, deduplication, retention, or storage handoff.

**How to avoid:**
Normalize output handling early: decode once, convert to `Blob` or persisted file reference, and keep only lightweight metadata in application state. Cap preview sizes, paginate the gallery, and decide whether large results should move to object storage instead of remaining inline. On the proxy, enforce payload limits and avoid buffering oversized responses into memory unnecessarily.

**Warning signs:**
- Job records embed full base64 strings in client state or local persistence.
- Opening the gallery causes a large memory spike or long main-thread stalls.
- Rerun/load-input actions pull entire prior result payloads when they only need workflow inputs.
- The proxy logs or serializes full output bodies.

**Phase to address:**
Phase 4: Outputs, gallery, and performance hardening.

---

### Pitfall 5: Building rerun, load-inputs, and cancel as UI shortcuts instead of audited state transitions

**What goes wrong:**
Users rerun one job and accidentally reuse inputs from another, cancel buttons mutate the wrong row, and restoring inputs from history replays stale or partially edited values. The app appears feature-complete but parity with the WPF workflow is false.

**Why it happens:**
These features look like minor UI conveniences, so teams add them on top of ad hoc component state instead of a normalized job model with immutable submitted input snapshots and stable IDs.

**How to avoid:**
Persist a canonical record for every submitted job: workflow fingerprint, normalized submitted inputs, Runpod job ID, timestamps, current lifecycle state, and derived outputs. Make rerun load from the submitted snapshot, not from whatever is currently on screen. Make load-inputs a deliberate replace action with diff preview when current form state is dirty. Require idempotent command handlers on the client so repeated clicks do not issue conflicting mutations.

**Warning signs:**
- Jobs are keyed by array index in the UI.
- "Rerun" reuses current editor state instead of the original submitted state.
- Dirty form state is overwritten without a diff or confirmation.
- Cancel/load-input logic lives only in UI components instead of a job store.

**Phase to address:**
Phase 3: Job history model and command handling.

---

### Pitfall 6: Making the backend proxy either too thin to be safe or too heavy to fit the deployment target

**What goes wrong:**
One extreme is direct browser-to-Runpod calls with CORS, secret, and observability blind spots. The other extreme is a heavy backend that persists user data, adds avoidable queues, buffers everything, and no longer fits the lightweight Runpod pod constraint. Both paths create rewrite pressure.

**Why it happens:**
Proxy scope is often decided late. Teams either avoid the security work by going direct from the browser, or they recreate an application backend when they only needed a narrow gateway for auth propagation, validation, and response shaping.

**How to avoid:**
Define the proxy contract early and keep it narrow: accept validated workflow/job requests, attach the user-supplied Runpod key for that request only, call the specific Runpod operations needed for parity, redact secrets, and return normalized responses. Do not add persistence, background workers, or a second queue unless a verified requirement demands it. Add request size limits, origin allow-listing, and strict logging rules.

**Warning signs:**
- The browser can hit Runpod directly in some code paths.
- The proxy stores keys or job payloads beyond request scope.
- The proxy introduces its own asynchronous task system before the app even has product traffic.
- There is no written list of allowed inbound and outbound routes.

**Phase to address:**
Phase 1: Proxy boundary and deployment footprint.

---

### Pitfall 7: Shipping happy-path validation only and hiding real node or worker failures

**What goes wrong:**
The UI shows generic "job failed" messages while the underlying cause is invalid workflow input, node-level validation failure, expired results, worker crash, or timeout. Users cannot tell whether to fix their workflow, retry later, or change endpoint settings.

**Why it happens:**
Both ComfyUI and Runpod expose richer failure detail than teams initially surface. Early implementations collapse all non-success states into one generic error banner because that is faster than designing typed error handling.

**How to avoid:**
Normalize failure classes across import, submit, execution, timeout, cancel, and retention-expiry paths. Preserve actionable error fields from upstream systems while redacting secrets. Show users whether the failure is retryable, user-fixable, or operator-fixable. Add test cases for invalid workflow imports, invalid prompt submission, timeout, queue delay, cancel-after-start, and expired-result retrieval.

**Warning signs:**
- Every failed job looks identical in the UI.
- Support requires reading raw upstream JSON to diagnose issues.
- There are no fixtures for known-invalid workflows or timeout cases.
- Error telemetry strips too much context to classify the failure.

**Phase to address:**
Phase 5: Reliability, error handling, and verification.

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
| ---------- | ----------------- | -------------- | ------------------------ |
| Store remembered Runpod keys in plain `localStorage` with no security hardening | Fastest BYOK implementation | XSS and same-origin exposure become release blockers | Only for a private prototype, never for a shared invited-user deployment |
| Parse workflow JSON with ad hoc property access and no normalization layer | Quick import demo | Constant breakage across workflow variants and poor parity with WPF behavior | Never |
| Keep full base64 outputs inside React state and job history records | Simplifies rendering | Memory bloat, slow rerenders, difficult persistence strategy | Only for the first end-to-end spike, not beyond initial prototype |
| Use fixed-interval status polling without backoff | Simple implementation | Wasted requests, noisy UX, poor handling of queue delay and rate limiting | Acceptable only during local testing |
| Let UI components own job mutations directly | Faster screen-level development | Race conditions across rerun, cancel, remove, and load-input flows | Never |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
| ----------- | ---------------------- | -------------------- |
| Runpod `/run` + `/status` | Assuming async results remain available indefinitely | Persist normalized completion metadata immediately and treat retention as short-lived |
| Runpod job policy | Setting `executionTimeout` but forgetting TTL covers queue plus execution | Set both values deliberately and size TTL with queue headroom |
| Runpod cancel | Treating cancel as synchronous completion | Model cancel as a requested transition, then confirm through status refresh |
| Runpod payloads | Returning oversized inline results through the proxy | Enforce payload limits and move large outputs to object storage or references |
| ComfyUI workflow import | Accepting any parsed JSON as a valid workflow | Validate against schema plus app-specific input conventions |
| ComfyUI prompt submission | Ignoring upstream `node_errors` and validation detail | Preserve and map structured validation failures into user-facing errors |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
| ------ | ---------------- | -------------- | ----------------- |
| Inline base64 everywhere | Long tab lifetimes, memory growth, sluggish gallery renders | Convert to blobs or references, paginate, dedupe decoded images | As soon as workflows return multi-MB images or users keep multiple results open |
| Naive polling across many job cards | Burst traffic, request storms, inconsistent UI freshness | Centralize polling, back off by state, pause hidden tabs, coalesce refreshes | Breaks once users monitor several active jobs at once |
| Recomputing workflow-derived forms on every render | Typing lag and stale-control bugs | Normalize imported workflow once and cache the derived form model | Breaks on larger workflows with many editable nodes |
| Proxy buffering full upstream responses | Pod memory spikes and slower throughput | Stream or bound response handling and drop unnecessary body logging | Breaks first on high-resolution outputs |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
| --------- | ------------------- | -------------- |
| Persisting BYOK secrets as if `localStorage` were trusted storage | API key theft through XSS, same-origin scripts, or shared browser profiles | Default to session-only entry, make persistence opt-in, harden against XSS, redact everywhere |
| Logging request headers or bodies on proxy errors | Secret leakage into logs and observability tools | Redact authorization and sensitive payload fields before any logging |
| Hosting unrelated apps on the same origin as the remembered-key app | Cross-app access to origin-scoped storage | Use a dedicated origin or subdomain for Chara2Img Web |
| Allowing broad CORS or proxy passthrough endpoints | Abuse of the proxy as a generic secret-forwarder | Restrict origins, methods, routes, and request shapes tightly |
| Rendering untrusted workflow metadata as HTML | XSS in the exact app that stores user keys locally | Render metadata as text only and sanitize any rich content paths |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
| --------- | ------------------ | -------------------- |
| Hiding queue state behind a spinner | Users think the app is frozen or broken | Show explicit queued/running/cancelling/completed states and timestamps |
| Making "Remember key" look like a harmless convenience checkbox | Users do not understand the security tradeoff | Add clear copy about browser-local persistence and a visible forget action |
| Overwriting current inputs when loading from a past job | Users lose in-progress edits | Show dirty-state warning and allow preview before replace |
| Surfacing only generic failure messages | Users cannot self-correct workflows | Map errors into user-fixable, retryable, and operator-fixable categories |
| Blocking the whole app while one job runs | Poor multitasking for iterative generation workflows | Treat jobs, inputs, and gallery as separate panes with independent state |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **BYOK support:** Often missing log redaction and a visible forget-key path — verify secrets never appear in client or server logs.
- [ ] **Workflow import:** Often missing schema-aware normalization and parity fixtures — verify multiple real WPF workflows import to the same extracted inputs.
- [ ] **Job controls:** Often missing cancel confirmation and retryable-state handling — verify cancel, timeout, expiry, and rerun each produce the correct final state.
- [ ] **Gallery:** Often missing large-payload handling — verify repeated viewing does not keep duplicating multi-MB image data in memory.
- [ ] **Load inputs from job:** Often missing dirty-form protection — verify the user gets a replace warning and that loaded values match the original submitted snapshot.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
| --------- | --------------- | -------------- |
| Runpod lifecycle mismatch | MEDIUM | Introduce a normalized job state machine, migrate stored records, and replay recent job statuses where possible |
| Insecure BYOK persistence | HIGH | Remove persisted keys, ship forced sign-out/forget flow, rotate exposed keys if users agree, and audit logs/telemetry for leakage |
| Fragile workflow parser | MEDIUM | Build a normalization layer, add a workflow fixture corpus, and backfill parser tests before adding more workflow features |
| Base64-heavy gallery architecture | MEDIUM | Move outputs to blobs or external storage references, add paging, and migrate job records away from inline payloads |
| Ad hoc rerun/load-input logic | MEDIUM | Introduce immutable submitted-input snapshots and rewire commands through a central job store |
| Generic error handling | LOW | Add typed error mapping, preserve upstream detail safely, and reclassify recent failures for support playbooks |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
| --------- | ---------------- | --------------------------------- |
| Treating Runpod jobs like normal HTTP requests | Phase 3: Job lifecycle and state orchestration | Simulate queue delay, timeout, expiry, cancel, and completion; confirm each lands in the correct persisted state |
| Treating browser-local key storage as secure secret storage | Phase 1: Security foundation and minimal proxy design | Inspect proxy/client logs, test forget-key flow, and verify secret-bearing requests are never persisted server-side |
| Assuming ComfyUI workflow JSON is stable, small, and easy to parse | Phase 2: Workflow import, normalization, and parity verification | Run a fixture corpus of real workflows and compare extracted inputs against expected parity snapshots |
| Letting proxy and client payloads balloon with base64 images | Phase 4: Outputs, gallery, and performance hardening | Measure memory before and after repeated gallery usage and verify no inline payload duplication in persisted state |
| Building rerun, load-inputs, and cancel as UI shortcuts instead of audited state transitions | Phase 3: Job history model and command handling | Verify rerun uses submitted snapshots, dirty forms prompt before replace, and repeated clicks remain idempotent |
| Making the backend proxy either too thin to be safe or too heavy to fit the deployment target | Phase 1: Proxy boundary and deployment footprint | Review allowed routes, memory footprint, and confirm browser code has no direct Runpod path in production |
| Shipping happy-path validation only and hiding real node or worker failures | Phase 5: Reliability, error handling, and verification | Run failure fixtures for invalid workflows, node validation errors, rate limits, timeout, and expired results |

## Sources

- Runpod docs, "Send API requests": https://docs.runpod.io/serverless/endpoints/send-requests
- Runpod docs, "Handler functions": https://docs.runpod.io/serverless/workers/handler-functions
- ComfyUI docs, "Workflow JSON": https://docs.comfy.org/specs/workflow_json
- ComfyUI docs, "Routes": https://docs.comfy.org/development/comfyui-server/comms_routes
- MDN, "Window: localStorage property": https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
- OWASP, "HTML5 Security Cheat Sheet": https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html
- Project context from `.gsd/PROJECT.md`

---

_Pitfalls research for: web client for serverless ComfyUI jobs with Runpod BYOK key handling_
_Researched: 2026-05-23_