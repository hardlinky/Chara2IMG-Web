# Architecture

**Analysis Date:** 2026-06-17

## Pattern Overview

**Overall:** Full-stack TypeScript monorepo with a React SPA frontend served by a Hono HTTP server acting as a secure proxy and persistence layer for RunPod AI workloads.

**Key Characteristics:**

- Three-zone source split: `src/client`, `src/server`, `src/shared` — each zone has strict dependency direction
- Hono server dual role: REST API gateway + SPA static file host (serves `dist/client/`)
- Client is completely separate from server at runtime (Vite builds SPA to `dist/client/`)
- Shared zone contains only pure TypeScript (no framework imports) — safe to import from both client and server
- All external RunPod API traffic is routed through the server proxy, never directly from browser

## Layers

**Shared (contracts + pure logic):**

- Purpose: Type contracts and framework-free workflow logic used by both client and server
- Location: `src/shared/`
- Contains: TypeScript type exports (`contracts/`), pure workflow transformation functions (`workflow/`)
- Depends on: Nothing (no framework dependencies)
- Used by: `src/client/` and `src/server/`

**Server (Hono API + SPA host):**

- Purpose: Validates requests, manages sessions, proxies RunPod API, persists job data, serves SPA bundle
- Location: `src/server/`
- Contains: Route registrations, Zod schemas, middleware, security handlers, stateful services
- Depends on: `src/shared/contracts/` (type contracts), Node.js built-ins, Hono
- Used by: Nothing (top-level entry point)

**Client (React SPA):**

- Purpose: Workflow import/editing, job submission, output gallery, settings — all rendered in browser
- Location: `src/client/`
- Contains: React components, feature hooks, typed API clients, browser storage adapters
- Depends on: `src/shared/` (contracts + workflow logic), browser APIs, Dexie, React
- Used by: Nothing (browser entry point)

## Data Flow

**Job Submission:**

1. User fills `DynamicInputEditor` (driven by `deriveInputControls` from shared workflow logic)
2. `App.tsx` calls `submitRunAndPersistRecentJob` in `src/client/lib/jobSubmission.ts`
3. `jobSubmission.ts` calls `runViaProxy` in `src/client/lib/api/runpodProxyClient.ts`
4. HTTP POST `/api/runpod/run` → server validates with Zod schema in `src/server/schemas/runpodProxy.ts`
5. `requireInvitedSession` middleware verifies signed session cookie
6. `forwardRunpodRequest` in `src/server/lib/runpodClient.ts` proxies to RunPod API
7. `trackRunpodJob` registers the job for background polling in `src/server/lib/runpodJobTracker.ts`
8. Job record saved server-side via `upsertRecentJob` → `/api/jobs` → `src/server/lib/recentJobsStore.ts`

**Job Polling:**

1. `useRecentJobs` hook in `src/client/features/jobs/useRecentJobs.ts` polls on interval
2. Calls `statusBatchViaProxy` → `POST /api/runpod/status-batch`
3. Server looks up cached state from `runpodJobStateStore.ts` (in-memory + filesystem)
4. Background tracker (`runpodJobTracker.ts`) polls RunPod and updates the state store
5. Client reconciles lifecycle snapshot from response, updates local job record via `updateRecentJobLifecycle`

**Workflow Import:**

1. User drops/pastes ComfyUI JSON in `WorkflowImport.tsx`
2. `importWorkflow` (`src/shared/workflow/importWorkflow.ts`) validates and normalizes the JSON
3. `deriveInputControls` (`src/shared/workflow/deriveInputControls.ts`) scans nodes for `[Input]`-prefixed titles
4. Workflow saved to IndexedDB via `workflowStorage.ts` (Dexie)
5. `useActiveWorkflowTemplate` loads it back; `DynamicInputEditor` renders derived controls

**State Management:**

- React component state in `App.tsx` and feature hooks (`useRecentJobs`, `useActiveWorkflowTemplate`, etc.)
- No global state store (no Redux/Zustand) — all state is local to hooks or lifted to `App.tsx`
- Browser persistence: IndexedDB (Dexie) for workflows; `localStorage` via typed storage adapters for settings
- Server persistence: JSON files on filesystem for recent jobs; temp-dir JSON for RunPod completed states

## Key Abstractions

**Route Registrar Functions:**

- Purpose: Each route group registers itself onto the Hono app via a `register*Routes(app)` function
- Examples: `src/server/routes/access.ts`, `src/server/routes/runpodProxy.ts`, `src/server/routes/admin.ts`
- Pattern: `export function register*Routes(app: Hono): void` — no return value, mutates `app`

**Typed API Clients (client-side):**

- Purpose: Thin typed fetch wrappers mapping client calls to server API endpoints
- Examples: `src/client/lib/api/runpodProxyClient.ts`, `src/client/lib/api/recentJobsClient.ts`, `src/client/lib/api/pinnedImageClient.ts`
- Pattern: Named exports per operation, typed request/response types co-located in same file

**Storage Adapters (client-side):**

- Purpose: Encapsulate browser storage (localStorage, IndexedDB) behind typed async functions
- Examples: `src/client/lib/workflowStorage.ts` (Dexie/IndexedDB), `src/client/lib/runpodKeyStorage.ts` (localStorage), `src/client/lib/endpointStorage.ts` (localStorage)
- Pattern: Named exports per CRUD operation, no class wrappers

**Zod Schema Modules (server-side):**

- Purpose: Input validation schemas for each route group, co-located in `src/server/schemas/`
- Examples: `src/server/schemas/runpodProxy.ts`, `src/server/schemas/access.ts`, `src/server/schemas/admin.ts`
- Pattern: Named exports per endpoint, `.strict()` objects, `safeParse` used in routes

**Feature Folders (client-side):**

- Purpose: Group related UI components and hooks by product domain
- Examples: `src/client/features/jobs/`, `src/client/features/outputs/`, `src/client/features/inputs/`, `src/client/features/workflows/`, `src/client/features/access/`
- Pattern: Each folder contains components (`.tsx`), hooks (`use*.ts`), and feature utilities (`.ts`)

## Entry Points

**Server:**

- Location: `src/server/index.ts`
- Triggers: Node.js `node src/server/index.ts` (or via `@hono/node-server`)
- Responsibilities: Creates Hono app via `createServerApp()`, registers all middleware and routes, starts HTTP listener on `PORT` (default 3000), registers `SIGTERM`/`unhandledRejection` handlers

**Client:**

- Location: `src/client/main.tsx`
- Triggers: Browser loads `dist/client/index.html`, which loads the Vite-bundled JS
- Responsibilities: Mounts `<App />` into `#root` DOM element inside `StrictMode`

**Vite Dev Server:**

- Location: `vite.config.ts`
- Triggers: `vite dev` (port 5173)
- Responsibilities: Bundles client to `dist/client/`, injects `__APP_VERSION__` from `package.json`

## Error Handling

**Strategy:** Fail-closed at validation boundaries, surface errors as typed JSON responses

**Patterns:**

- Zod `safeParse` on every incoming request body; returns `{ ok: false, error }` with HTTP 400 on invalid input
- Route-level try/catch with `logServerError` before returning `{ ok: false, error: "..." }` with HTTP 500
- Global `app.onError` handler in `src/server/index.ts` catches unhandled route errors
- Client API clients throw `ProxyRequestError` for non-OK HTTP responses; callers handle explicitly
- `unhandledRejection` and `uncaughtException` are caught and logged by the server process handlers

## Cross-Cutting Concerns

**Logging:** `src/server/lib/logger.ts` — `logServerError` / `logServerWarning` used throughout server; no client-side logging framework

**Validation:** Zod schemas in `src/server/schemas/` for all HTTP inputs; shared pure validators in `src/shared/workflow/validateInputDraft.ts` and `src/shared/workflow/workflowSchemas.ts`

**Authentication:** Two-tier cookie-based:
1. Invite tier — `INVITE_SECRET` env var; valid code issues a signed `invited_session` cookie via `src/server/middleware/session.ts`
2. Admin tier — `ADMIN_PASSKEY` env var; valid passkey issues a signed `admin_session` cookie; SHA-256 digest used as cookie value
All `/api/runpod/*` and `/api/admin/*` routes guard with `requireInvitedSession` middleware.

**Secret Redaction:** `src/server/lib/redaction.ts` — scrubs API keys and secrets from logged error metadata before emission

---

_Architecture analysis: 2026-06-17_
