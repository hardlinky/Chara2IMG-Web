# Architecture Research

**Domain:** Browser app + lightweight backend proxy + Runpod serverless ComfyUI
**Researched:** 2026-05-23
**Confidence:** MEDIUM-HIGH

## Standard Architecture

### System Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ Browser App                                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌──────────────┐ │
│ │ Workflow UI    │ │ Job Console    │ │ Output Gallery │ │ Local Store  │ │
│ │ + parser       │ │ + poller       │ │ + rerun/load   │ │ IndexedDB    │ │
│ └──────┬─────────┘ └──────┬─────────┘ └──────┬─────────┘ └──────┬───────┘ │
│        │                  │                  │                  │         │
├────────┴──────────────────┴──────────────────┴──────────────────┴─────────┤
│ Lightweight Proxy API                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌──────────────┐ │
│ │ Invite/Auth    │ │ Runpod adapter │ │ Job ledger     │ │ Webhook      │ │
│ │ boundary       │ │ + validation   │ │ SQLite + files │ │ ingestion    │ │
│ └──────┬─────────┘ └──────┬─────────┘ └──────┬─────────┘ └──────┬───────┘ │
│        │                  │                  │                  │         │
├────────┴──────────────────┴──────────────────┴──────────────────┴─────────┤
│ External Execution                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────┐    ┌────────────────────────────────────┐ │
│ │ Runpod queue-based endpoint  │ -> │ ComfyUI worker wrapper + models    │ │
│ │ /run /status /cancel /health │    │ workflow apply, execute, normalize │ │
│ └──────────────────────────────┘    └────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Browser app | Parse workflow JSON, derive editable inputs, submit jobs, poll status, render gallery, cache job/output state locally | React or similar SPA, TypeScript, IndexedDB-backed state |
| Proxy API | Authenticate invited users, validate payloads, forward Runpod lifecycle calls, sanitize logs, accept completion webhooks | Small Node service, preferably Fastify + schema validation |
| Job ledger | Persist job metadata and completed outputs so results survive browser closure and Runpod result expiry | SQLite for metadata plus local files or S3-compatible blob storage |
| Runpod adapter | Map app-level job requests to Runpod `/run`, `/status`, `/cancel`, `webhook`, and policy fields | Thin client module with retries, backoff, and response normalization |
| Runpod serverless endpoint | Queue jobs, scale workers, execute ComfyUI workflows, emit completion payloads | Queue-based endpoint with handler function |
| ComfyUI worker wrapper | Apply input values to workflow JSON, invoke ComfyUI, surface normalized progress/result payloads | Python handler around ComfyUI API or embedded execution wrapper |

## Recommended Architecture

Use a local-first browser app with a thin, state-light proxy and a queue-based Runpod endpoint.

The browser should own workflow parsing, form generation, rerun/load-inputs behavior, and most UI state. That keeps the proxy small and avoids burning CPU or RAM on work the browser can do cheaply. The proxy should not become a second workflow engine. It should validate requests, enforce invitation/auth boundaries, manage short-lived provider credentials, and translate between the browser contract and Runpod's queue-based lifecycle.

For reliability, do not depend on browser polling alone. Runpod async results are retained for 30 minutes after completion, and sync results only 1 minute. That is enough for interactive polling, but not enough to guarantee that outputs survive tab closure or sleep. The proxy should therefore include a minimal durable job ledger and a webhook ingestion endpoint. Browser polling remains the primary UX path for active jobs; webhook capture is the reliability backstop.

For security, never persist Runpod API keys in server storage. Keep BYOK browser-local only, opt-in, and explicit. If the user enables remember, store it under the app origin in IndexedDB and be honest that this is convenience storage, not hardware-backed secret storage. The proxy should either receive the user key on each request or exchange it for a short-lived in-memory proxy session; it should never write the key to disk, logs, or the durable job ledger.

### Component Boundaries

| Boundary | Owns | Must Not Own |
|----------|------|--------------|
| Browser app | Workflow template files, parsed input schema, form state, local job cache, gallery cache, BYOK remember UX | Server trust decisions, durable canonical job history, Runpod credential persistence |
| Proxy API | User session/auth, request validation, rate limiting, Runpod transport, webhook ingestion, durable job metadata | Workflow authoring UI logic, long-running poll loops for every job, user API key persistence |
| Job ledger | Canonical job state snapshot, submitted payload hash, result manifest, completion timestamps, output references | Raw user API keys, full browser session state, transient UI flags |
| Runpod endpoint | Queueing, worker scale-up, execution timeout/TTL enforcement, cancellation, worker health | App-level user auth, app gallery organization, invitation logic |
| ComfyUI worker wrapper | Input application, workflow execution, output normalization, progress reporting | Browser-facing auth/session logic, product-level history UI |

## Recommended Project Structure

```text
src/
├── app/                  # Browser routes, shell, page composition
├── features/
│   ├── workflows/        # Workflow upload, parser, input schema, apply-input logic
│   ├── jobs/             # Submit, poll, cancel, rerun, load-inputs, job table
│   ├── gallery/          # Output decoding, thumbnails, pruning, viewer
│   └── auth/             # Invite/session UI and BYOK remember UX
├── state/                # Client stores, query cache, IndexedDB adapters
├── shared/
│   ├── contracts/        # DTOs for jobs, status, outputs, validation schemas
│   ├── workflow/         # Shared workflow parsing and normalization helpers
│   └── utils/            # Timeouts, retry helpers, hashing, IDs
├── server/
│   ├── routes/           # /api/jobs, /api/key-session, /api/webhooks/runpod
│   ├── auth/             # Invite/session middleware
│   ├── runpod/           # Runpod client, request policies, error mapping
│   ├── store/            # SQLite repositories, file/blob abstraction
│   └── observability/    # Structured logs, health, metrics
└── worker-contracts/     # ComfyUI/Runpod payload adapters and fixtures
```

### Structure Rationale

- **features/workflows:** Keeps WPF-parity logic for parsing `[Input]` and `[Input#]` node conventions close to the UI that uses it.
- **shared/contracts:** Prevents browser and proxy from drifting on status/result shapes.
- **server/runpod:** Keeps Runpod-specific transport and retry logic out of route handlers.
- **server/store:** Isolates the minimum durable persistence needed for reliability from the rest of the proxy.
- **state:** Makes the browser local-first without coupling components directly to IndexedDB details.

## Architectural Patterns

### Pattern 1: Local-First UI, Durable Server Backstop

**What:** Browser state is primary for responsiveness; server persistence exists only to prevent job/result loss.
**When to use:** Small invited-user apps where the browser can own most state, but job completion must survive tab closure.
**Trade-offs:** Lowest steady-state server cost, but introduces two sources of truth that must be reconciled by job ID.

**Example:**
```typescript
type LocalJob = {
  id: string;
  submittedAt: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  inputSnapshot: AppliedWorkflowInput;
  resultRef?: { source: 'indexeddb' | 'server'; key: string };
};

async function reconcileJob(jobId: string) {
  const local = await jobsDb.get(jobId);
  const remote = await api.getJob(jobId);
  return mergeJobState(local, remote);
}
```

### Pattern 2: Ephemeral BYOK Session

**What:** The browser owns the remembered Runpod key; the proxy only holds it in memory for a short TTL after exchange.
**When to use:** BYOK systems where you want to avoid transmitting the provider key on every call without persisting it server-side.
**Trade-offs:** Slightly more implementation complexity than raw pass-through headers, but reduces accidental exposure in repeated requests.

**Example:**
```typescript
type KeySessionRequest = { runpodApiKey: string };
type KeySessionResponse = { expiresAt: string };

await api.post<KeySessionResponse>('/api/key-session', {
  runpodApiKey: userSuppliedKey,
});

await api.post('/api/jobs', payload, {
  credentials: 'include',
});
```

### Pattern 3: Queue-Native Job Lifecycle

**What:** Build on Runpod queue-based endpoint semantics instead of recreating a custom job system in the proxy.
**When to use:** Jobs need async execution, polling, cancellation, backpressure, and guaranteed processing.
**Trade-offs:** Slightly higher latency than direct HTTP workers, but much better fit for WPF-parity run/status/cancel behavior.

**Example:**
```typescript
const runpodRequest = {
  input: normalizedWorkflowPayload,
  webhook: `${publicBaseUrl}/api/webhooks/runpod/${jobWebhookToken}`,
  policy: {
    executionTimeout: 15 * 60 * 1000,
    ttl: 60 * 60 * 1000,
  },
};
```

### Pattern 4: Normalize Outputs at the Worker Boundary

**What:** Convert ComfyUI-specific output shapes into a stable app contract before they reach the browser.
**When to use:** The upstream execution engine may change node details, but the app UI needs stable gallery semantics.
**Trade-offs:** Adds a mapping layer, but prevents the UI from being tightly coupled to raw ComfyUI internals.

## Data Flow

### Request Flow

```text
[User loads workflow JSON]
    ↓
[Browser parser derives input schema]
    ↓
[User edits inputs]
    ↓
[Browser applies inputs to workflow snapshot]
    ↓
[Proxy validates request + attaches key session]
    ↓
[Runpod /run queues job]
    ↓
[ComfyUI worker executes workflow]
    ↓
[Runpod status/progress + completion webhook]
    ↓
[Proxy updates durable ledger]
    ↓
[Browser poller reconciles status and fetches results]
    ↓
[Gallery stores blobs/thumbnails in IndexedDB]
```

### State Management

```text
[IndexedDB + in-memory store]
    ↓ (hydrate on app load)
[Workflow UI / Jobs UI / Gallery UI]
    ↕
[Feature actions]
    ↓
[Proxy API + reconciliation]
    ↓
[Local store update + durable server snapshot merge]
```

### Key Data Flows

1. **Workflow parse/apply flow:** Browser imports workflow JSON, identifies editable nodes by title convention, generates typed controls, then applies values into a submitted workflow snapshot. This should stay entirely client-side.
2. **Job submission flow:** Browser sends the applied workflow plus policy hints to the proxy. Proxy validates schema, resolves a short-lived Runpod key session, submits `/run`, and records the canonical job envelope locally and in SQLite.
3. **Status/progress flow:** Browser polls only active jobs with exponential backoff. Proxy forwards `/status` and merges in any webhook-captured completion data so polling can recover after browser interruptions.
4. **Cancel flow:** Browser sends cancel for a running or queued job. Proxy forwards `/cancel`, updates local durable state optimistically, then reconciles on the next status read.
5. **Rerun/load-inputs flow:** Browser reconstructs the form from the stored input snapshot and workflow snapshot, not by scraping a rendered gallery item. That preserves WPF-style behavior cleanly.
6. **Output gallery flow:** On completion, the proxy stores a normalized result manifest; the browser fetches outputs, decodes base64 or downloads referenced files, writes blobs/thumbnails to IndexedDB, and prunes according to quota rules.

## Suggested Build Order

1. **Shared contracts + workflow fixtures** — Lock the browser/proxy/worker payload shape first so the rest of the system is integration-safe.
2. **Workflow parser and input application in the browser** — This is the parity-critical logic and does not depend on infrastructure.
3. **Thin proxy shell with invite auth and health checks** — Establish the trust boundary before wiring provider calls.
4. **Runpod adapter for `/run`, `/status`, `/cancel`** — Use queue-based lifecycle early because it is the controlling abstraction for reliability.
5. **Local job store + poller + rerun/load-inputs** — Proves WPF parity before gallery polish.
6. **Webhook ingestion + durable job ledger** — Adds offline reliability and protects against Runpod result retention windows.
7. **Gallery persistence and pruning** — Persist blobs/thumbnails only after the upstream job/result contract is stable.
8. **Hardening** — Rate limiting, structured logging, retry tuning, worker policy tuning, quota management.

Build-order implication: do not start with a custom server-side job scheduler or a complex multi-service split. The core risk is payload correctness and lifecycle parity, not orchestration scale.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k users | Single browser app + one small proxy pod + one queue-based Runpod endpoint; SQLite is sufficient; browser polling only for active jobs |
| 1k-100k users | Move static frontend to CDN, run multiple proxy instances, move job ledger to Postgres, shift output blobs to object storage, add batched status aggregation |
| 100k+ users | Separate gallery storage service, add queue/webhook processor, partition job history, introduce stronger tenant isolation and dedicated auth |

### Scaling Priorities

1. **First bottleneck:** Result durability, not raw proxy CPU. Solve it with webhook capture and output storage before splitting services.
2. **Second bottleneck:** Output payload size and browser storage pressure. Solve it with thumbnail generation, blob pruning, and object storage references for large outputs.

## Anti-Patterns

### Anti-Pattern 1: Direct Browser-to-Runpod Calls

**What people do:** Let the SPA call Runpod directly with the user API key.
**Why it's wrong:** You lose request validation, app-level auth, centralized retries, logging hygiene, and a place to handle webhook-backed durability.
**Do this instead:** Keep a thin proxy that validates, forwards, sanitizes, and records job metadata.

### Anti-Pattern 2: Server-Side Persistence of BYOK Secrets

**What people do:** Store Runpod API keys in a database for convenience.
**Why it's wrong:** It expands the blast radius of a server compromise and creates unnecessary secret-management obligations.
**Do this instead:** Keep remember state browser-local and keep any proxy-side provider session memory-only with a short TTL.

### Anti-Pattern 3: Proxy-Owned Polling Daemon for Every Job

**What people do:** Add a background poller that continuously checks all active jobs server-side.
**Why it's wrong:** It burns CPU and requests on a lightweight pod and duplicates Runpod's existing queue lifecycle.
**Do this instead:** Let the browser poll active jobs on demand and use Runpod webhooks as the reliability backstop.

### Anti-Pattern 4: Coupling the UI to Raw ComfyUI Output Shapes

**What people do:** Render gallery items directly from whatever ComfyUI returns today.
**Why it's wrong:** Upstream node/output changes leak into the app and make rerun/load-inputs brittle.
**Do this instead:** Normalize outputs once at the worker/proxy boundary into a stable job result contract.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Runpod queue-based endpoint | Proxy submits `/run`, polls `/status`, forwards `/cancel`, consumes webhook completion | Best fit for guaranteed execution, async lifecycle, and queue backpressure |
| ComfyUI worker wrapper | Runpod handler applies workflow inputs and returns normalized output payloads | Keep heavy model initialization outside the handler for faster warm runs |
| Browser storage | IndexedDB for workflow templates, job cache, and gallery blobs | Better suited than localStorage for structured data and blobs |
| Optional object storage | Store large output files and generated thumbnails when inline payloads get too large | Useful because Runpod handler payloads are capped and async results expire |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Browser ↔ Proxy | JSON over HTTPS with session cookies | Main app contract; keep explicit schemas on both sides |
| Proxy ↔ Runpod | HTTPS with bearer auth and policy fields | Centralize retries, timeout policy, and error mapping |
| Runpod ↔ Proxy webhook | HTTPS callback to signed or tokenized webhook path | Needed so results survive browser disconnects |
| Browser ↔ IndexedDB | Repository adapter, not direct component access | Keeps storage concerns out of UI components |
| Proxy ↔ Job ledger | Repository abstraction | Allows SQLite now and Postgres/object storage later |

## Recommended Build Choices

- Prefer a **queue-based Runpod endpoint**, not a load-balancing endpoint. Queue-based endpoints provide the exact async lifecycle this product needs: `/run`, `/status`, `/cancel`, built-in queueing, and automatic retries. Load-balancing endpoints are better for low-latency custom HTTP servers, but they bypass the queue and drop backlog handling responsibilities back onto your app.
- Prefer a **single lightweight proxy service** over separate API, worker, and history services. The invited-user scope does not justify microservices.
- Prefer **browser polling + webhook durability** over constant server polling. That is the best security/reliability/resource balance for this scope.
- Prefer **cached models and FlashBoot** on the Runpod endpoint to reduce cold start time and keep the worker image small.
- Prefer **one canonical job contract** shared across browser, proxy, and worker wrapper. WPF parity depends more on consistent job semantics than on framework choice.

## Sources

- Runpod Serverless overview: https://docs.runpod.io/serverless/overview
- Runpod Send API requests: https://docs.runpod.io/serverless/endpoints/send-requests
- Runpod Endpoint settings: https://docs.runpod.io/serverless/endpoints/endpoint-configurations
- Runpod Load balancing overview: https://docs.runpod.io/serverless/load-balancing/overview
- Runpod Handler functions: https://docs.runpod.io/serverless/workers/handler-functions
- Runpod Workers overview: https://docs.runpod.io/serverless/workers/overview
- Runpod Cached models: https://docs.runpod.io/serverless/endpoints/model-caching
- ComfyUI server overview: https://docs.comfy.org/development/comfyui-server/comms_overview
- ComfyUI routes: https://docs.comfy.org/development/comfyui-server/comms_routes
- ComfyUI basic API example: https://github.com/Comfy-Org/ComfyUI/blob/master/script_examples/basic_api_example.py
- MDN Web Crypto API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
- MDN IndexedDB API: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API

---

_Architecture research for: Chara2Img Web_
_Researched: 2026-05-23_