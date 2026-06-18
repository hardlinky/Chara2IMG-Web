# External Integrations

**Analysis Date:** 2026-06-17

## APIs & External Services

**AI Inference:**

- **RunPod Serverless API** — Primary external integration; submits image generation jobs and polls status
  - Base URL: `https://api.runpod.ai/v2/{endpointId}/{operation}`
  - SDK/Client: native `fetch` via `src/server/lib/runpodClient.ts`
  - Auth: Bearer token — user-supplied API key, stored in client `localStorage` under `runpod_api_key`; forwarded server-side per request
  - Operations proxied: `run`, `status`, `cancel`, `retry`, `purge-queue`
  - Endpoint ID stored in client `localStorage` under `runpod_endpoint_id` via `src/client/lib/endpointStorage.ts`
  - Server-side proxy route: `src/server/routes/runpodProxy.ts` — isolates API key from direct browser exposure

## Data Storage

**Databases:**

- None — no relational or document database

**File System (Server-side):**

- Recent jobs store: flat JSON file (`recent-jobs.v1.json`) in a configurable directory
  - Path: `../chara2img/recent-jobs` by default, overridden by `RECENT_JOBS_STORAGE_DIR` env var
  - Implementation: `src/server/lib/recentJobsStore.ts`
- Pinned images: individual image files stored on disk
  - Directory managed by `src/server/lib/pinnedImageStorageStats.ts`
  - Manifest tracks per-client references for garbage collection

**Client-side Storage (Browser):**

- `localStorage` — persists RunPod API key, endpoint ID, workflow settings, input editor state, and pinned image manifest snapshot
  - `runpod_api_key` — RunPod API key (`src/client/lib/runpodKeyStorage.ts`)
  - `runpod_endpoint_id` — RunPod endpoint ID (`src/client/lib/endpointStorage.ts`)
  - `chara2imgClientPinnedManifest.v1` — client-side pinned output manifest backup (`src/client/lib/clientPinnedManifest.ts`)
- IndexedDB (via Dexie) — client-side job history, workflow storage, input editor drafts
  - `src/client/lib/recentJobsStorage.ts`, `src/client/lib/workflowStorage.ts`, `src/client/lib/inputEditorStorage.ts`

**File Storage:**

- Local filesystem only — no cloud object storage (S3, GCS, etc.)
- Pinned output images saved as files under the `PINNED_IMAGES_DIR` path
- ZIP bundles generated in-memory via `yazl` and streamed to client

**Caching:**

- None — no Redis, Memcached, or HTTP caching layer beyond browser defaults

## Authentication & Identity

**Auth Provider:**

- Custom — no third-party auth service (no Auth0, Clerk, Supabase Auth, etc.)

**Implementation:**

- Invite-based access: users present an invite secret; server issues a signed session cookie (`invited_session`)
- Admin access: separate signed cookie (`admin_session`) issued after admin passkey verification
- Session cookies: `httpOnly`, `sameSite: Lax`, 8-hour max age; `secure` flag in production
- Cookie signing via `hono/cookie` `setSignedCookie`/`getSignedCookie` with `COOKIE_SECRET` env var
- Admin passkey: auto-generated random 18-byte base64url value at startup if `ADMIN_ACCESS_KEY` env var is absent; logged to console
- Invite verification: timing-safe comparison via `node:crypto` `timingSafeEqual` (`src/server/security/invite.ts`)

## Monitoring & Observability

**Error Tracking:**

- None — no Sentry, Datadog, or similar external service

**Logs:**

- Structured JSON console logging (`src/server/lib/logger.ts`)
- `console.error` for errors, `console.warn` for warnings; each entry includes `level`, `context`, `error`, `metadata`, `timestamp`
- No external log shipping

## CI/CD & Deployment

**Hosting:**

- Not detected — no deployment config files (`Dockerfile`, `fly.toml`, `render.yaml`, etc.)

**CI Pipeline:**

- Not detected — no `.github/workflows`, `Jenkinsfile`, or similar

## Environment Configuration

**Required env vars (production):**

- `COOKIE_SECRET` — must be set; empty string falls back to unsigned-equivalent behavior
- `PORT` — HTTP port (defaults to `3000`)

**Optional env vars:**

- `ADMIN_ACCESS_KEY` — pre-set admin passkey; auto-generated if absent
- `ALLOWED_ORIGIN` — explicit CORS/CSRF origin; same-origin policy applies if absent
- `RECENT_JOBS_STORAGE_DIR` — override storage path for job JSON files

**Secrets location:**

- Environment variables only; no `.env` file committed (no `dotenv` dependency detected)

## Webhooks & Callbacks

**Incoming:**

- None — RunPod uses polling, not webhooks

**Outgoing:**

- None

---

_Integration audit: 2026-06-17_
