# Project Research Summary

**Project:** Chara2Img Web
**Domain:** Full-parity web client for Runpod serverless ComfyUI with BYOK support
**Researched:** 2026-05-23
**Confidence:** MEDIUM

## Executive Summary

Chara2Img Web is best treated as a private, tool-style workflow client rather than a general-purpose AI platform. The research converges on a local-first browser app that imports existing ComfyUI workflows, derives a simplified input surface from them, submits jobs to Runpod's queue-based serverless endpoints, and preserves the user's ability to rerun, load prior inputs, and browse outputs with provenance. Experts build this type of product by keeping workflow parsing and UI state in the browser, using a thin proxy for validation and auth boundaries, and treating Runpod as the authoritative job system instead of inventing a second queue.

The recommended implementation is a React 19 + Vite 7 SPA backed by a small Node 24 + Hono proxy. Browser-local IndexedDB should hold workflow templates, job caches, gallery blobs, and optional remembered BYOK state; the proxy should validate requests, normalize responses, forward `/run`, `/status`, and `/cancel`, and capture completion via webhook-backed durable job metadata. This gives the invited-user v1 the right balance of responsiveness, low ops burden, and reliability without forcing early server-side accounts, shared storage, or collaboration features.

The main risks are not framework selection but correctness and trust boundaries. Workflow JSON is flexible and easy to parse incorrectly, Runpod jobs behave like a queueing system rather than normal HTTP requests, and BYOK persistence becomes a security problem if it is treated like safe secret storage. The roadmap should therefore front-load security boundaries and parser normalization, then focus on an explicit job state machine and durable result capture before polishing presets or richer gallery features.

## Key Findings

### Recommended Stack

The strongest stack recommendation is a client-heavy React SPA with a thin Node proxy in the same repo. Vite fits better than SSR-first frameworks because this is an invited-user utility app with minimal SEO needs, and Hono fits the backend scope better than a heavier framework because the proxy should remain narrow and transport-focused.

The supporting stack should reinforce local-first behavior and shared contracts: React Router for app structure, TanStack Query for job submission and polling, Dexie for IndexedDB persistence, and Zod for schema validation across browser and proxy. Tailwind is a pragmatic styling choice, but it is secondary to establishing stable workflow parsing, job contracts, and proxy boundaries.

**Core technologies:**

- React 19 + Vite 7: browser UI and build pipeline for an input-heavy SPA with fast iteration and modern async UI primitives.
- Node.js 24 LTS + Hono 4.12: thin proxy runtime for request validation, Runpod forwarding, and optional static serving without unnecessary backend weight.
- Runpod queue-based serverless endpoints: authoritative job lifecycle for `/run`, `/status`, `/cancel`, retry, and retention-aware execution.
- TanStack Query 5 + React Router 7: route-aware app shell plus disciplined server-state polling, retry, and mutation handling.
- Dexie 4.4 + Zod 4: local persistence for templates/history and strict workflow or payload validation at every boundary.

### Expected Features

The launch feature set is tight and product-defining. Users expect workflow JSON import, dynamic input generation, async job tracking, rerun/load-inputs controls, an output gallery with provenance, actionable failures, and secure API-key entry. The app's main differentiator is not a broader feature list; it is making arbitrary private ComfyUI workflows operable through a reliable simplified UI while preserving parity with the existing desktop flow.

The research is equally clear on what to defer. A full graph editor, team collaboration suite, multi-provider abstraction, and server-side key storage all create scope or security burdens that are misaligned with the invited-user v1. Presets, richer progress feedback, and starter workflow catalogs are good follow-ons only after the parser, job model, and gallery loop are stable.

**Must have (table stakes):**

- Workflow JSON import and validation: users need to load existing ComfyUI workflows and trust that the app extracted the right editable inputs.
- Dynamic input surface: the simplified form layer is core to full-parity usability without exposing the full graph.
- Queue-based job submission and status tracking: required for Runpod's async execution model.
- Job list with rerun, load-inputs, cancel, and remove: critical to the iterative workflow loop.
- Output gallery with provenance: required so completed runs remain useful after the queue clears.
- BYOK entry with browser-local remember: needed for the invited-user Runpod model without becoming a billing proxy.
- Failure visibility and retry-safe behavior: required to make remote GPU execution feel trustworthy.

**Should have (competitive):**

- Workflow-aware form generation across diverse workflow JSONs: strongest differentiator if it works reliably.
- Reproducibility loop from gallery to rerun: turns history into fast creative iteration.
- Opinionated job workspace for long-running GPU tasks: explicit queue, cancel, and stale-job recovery UX.
- Presets for recurring character setups: high leverage once the input schema is stable.

**Defer (v2+):**

- Full in-browser ComfyUI graph editing.
- Team collaboration, shared asset libraries, and heavy account systems.
- Multi-provider backend abstraction beyond Runpod.
- Automatic central cloud syncing of all assets.

### Architecture Approach

The architecture should keep the browser as the primary place where workflows are parsed, inputs are normalized, forms are rendered, and local history is managed, while the proxy stays responsible for trust boundaries, validation, Runpod transport, and webhook-backed durability. The key architectural decision is to be local-first for responsiveness but not browser-only for durability: browser polling should drive the live UX, but a small durable job ledger on the proxy should backstop result retention and tab-closure recovery.

**Major components:**

1. Browser app: imports workflow JSON, derives editable schema, applies inputs, submits jobs, reconciles status, and stores templates and gallery blobs locally.
2. Proxy API: enforces invite or session boundaries, validates requests, redacts secrets, forwards Runpod lifecycle calls, and ingests completion webhooks.
3. Job ledger: stores canonical job state, input snapshot hashes, completion metadata, and output references so results survive browser interruption and Runpod retention limits.
4. Runpod adapter and endpoint: maps app job contracts onto queue-native `/run`, `/status`, `/cancel`, timeout, TTL, and webhook semantics.
5. ComfyUI worker wrapper: applies normalized inputs to workflow JSON and converts raw execution outputs into a stable app-facing result contract.

### Critical Pitfalls

The most important pitfalls cluster around state modeling, not styling or framework choice. Any roadmap that treats jobs as simple request-response calls, trusts ad hoc workflow parsing, or treats remembered BYOK state as secure storage will create expensive rework.

1. **Modeling Runpod jobs like ordinary HTTP requests** — avoid this by implementing an explicit job state machine with queued, running, cancel-requested, cancelled, completed, failed, expired, and lost-result states, plus backoff-aware polling and immediate completion persistence.
2. **Treating browser-local BYOK storage as secure secret storage** — avoid this by making persistence opt-in, keeping the proxy memory-only for provider keys, redacting logs, hardening against XSS, and being explicit that remember is convenience storage.
3. **Overfitting workflow parsing to a few JSON samples** — avoid this by validating against ComfyUI schema plus app conventions, normalizing IDs and titles, and maintaining a regression corpus from real WPF workflows.
4. **Letting base64 outputs bloat proxy and client state** — avoid this by normalizing outputs into blobs or file references, keeping only lightweight metadata in app state, and enforcing payload limits.
5. **Implementing rerun, load-inputs, and cancel as UI shortcuts instead of audited state transitions** — avoid this by storing immutable submitted input snapshots and routing mutations through a central job store.

## Implications for Roadmap

Based on the combined research, the roadmap should be organized around risk retirement rather than UI surface area. The first two phases should establish secure boundaries and parser parity because every later job and gallery feature depends on them. The middle phases should then build the queue-native lifecycle and durability story before moving to output handling, performance, and hardening.

### Phase 1: Security Foundation and Thin Proxy

**Rationale:** The BYOK trust boundary and proxy scope are foundational; getting them wrong either creates a security problem or forces a backend rewrite.
**Delivers:** Node 24 + Hono proxy shell, invite or simple access boundary, request validation, key handling rules, route allow-list, redacted logging, and health checks.
**Addresses:** BYOK entry, secure API access, minimal invited-user access control.
**Avoids:** Insecure secret persistence and the too-thin or too-heavy proxy trap.

### Phase 2: Workflow Import, Normalization, and Parity

**Rationale:** Dynamic input generation is the product's core differentiator, and every rerun or preset feature depends on a trustworthy normalized workflow model.
**Delivers:** Workflow JSON import, schema validation, normalization layer, input extraction for `[Input]` conventions, applied-workflow generation, and regression fixtures from real workflows.
**Uses:** React 19, Zod 4, shared contracts, browser-local parsing.
**Implements:** Browser workflow parser and shared workflow normalization helpers.
**Avoids:** Fragile parser assumptions and false parity with WPF behavior.

### Phase 3: Queue-Native Job Lifecycle and History

**Rationale:** Once workflows can be parsed and applied reliably, the controlling risk becomes lifecycle correctness across submission, status, cancel, rerun, and load-inputs.
**Delivers:** Queue-based `/run`, `/status`, `/cancel` integration, canonical job records, immutable submitted input snapshots, centralized poller with backoff, rerun, load-inputs, remove, and explicit lifecycle states.
**Uses:** TanStack Query, React Router app shell, shared DTOs, Runpod queue endpoints.
**Implements:** Proxy Runpod adapter, job store, and client-server reconciliation flow.
**Avoids:** Treating Runpod as normal HTTP and implementing rerun/cancel as ad hoc UI actions.

### Phase 4: Durable Results and Gallery

**Rationale:** The product only feels complete once outputs survive queue clearing, browser interruption, and Runpod retention windows.
**Delivers:** Webhook ingestion, durable job ledger, normalized result manifest, gallery persistence, blob handling, thumbnails, provenance views, and pruning rules.
**Uses:** Dexie for local blobs, minimal server ledger storage, worker-side output normalization.
**Implements:** Webhook-backed durability and gallery data flow.
**Avoids:** Lost results and base64-heavy payload architecture.

### Phase 5: Reliability, Error Taxonomy, and Hardening

**Rationale:** After the main product loop works, the remaining differentiator is trustworthiness under failure, queue delay, timeout, and malformed workflow conditions.
**Delivers:** Typed failure mapping, timeout and expiry handling, quota or payload guards, CSP and XSS hardening, rate limits, observability, and end-to-end verification coverage.
**Addresses:** Failure visibility, retry-safe behavior, and invited-user operational confidence.
**Avoids:** Generic error handling and security regressions around remembered keys or untrusted metadata.

### Phase 6: Presets and Onboarding Enhancements

**Rationale:** Presets and starter workflows only make sense once the normalized input schema and rerun flow are stable.
**Delivers:** Saved presets per workflow, starter templates or workflow catalog, and UX refinements for repeated character generation.
**Addresses:** Competitive usability improvements for the invited cohort.
**Avoids:** Prematurely productizing unstable input schemas.

### Phase Ordering Rationale

- Security and proxy boundaries come first because BYOK handling is a non-negotiable trust constraint and every later phase crosses that boundary.
- Workflow normalization comes before job execution because the app's differentiator and parity claims depend on applying the right inputs to the right workflow snapshot.
- Job lifecycle precedes gallery polish because rerun, cancel, completion, and provenance semantics determine what the gallery can safely display.
- Durability and blob handling are separated from the first job phase so the initial lifecycle can stay simple while still reserving a dedicated phase for retention and memory-pressure risks.
- Hardening is a distinct phase because failure taxonomies, CSP, payload limits, and rate limiting should be informed by a working end-to-end loop rather than guessed up front.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 2:** Workflow normalization and exposed-input conventions need deeper investigation against the real WPF workflow corpus because current research identifies the risk but not the exact normalization rules.
- **Phase 3:** Runpod lifecycle policy sizing, cancellation semantics, and status reconciliation need focused planning because TTL, retention windows, and queue behavior directly affect the product contract.
- **Phase 4:** Output storage strategy may need deeper research if expected image sizes or retention needs exceed comfortable IndexedDB-only limits.

Phases with standard patterns (skip research-phase):

- **Phase 1:** Thin proxy setup, request validation, logging redaction, and simple invite gating are well-understood patterns.
- **Phase 5:** CSP, rate limiting, typed error surfacing, observability, and end-to-end verification are standard hardening practices once the app contract exists.
- **Phase 6:** Presets and starter-template UX are straightforward extensions after the normalized workflow model is stable.

## Confidence Assessment

| Area         | Confidence | Notes |
| ------------ | ---------- | ----- |
| Stack        | HIGH       | Driven mostly by current official docs for React, Vite, Node, Runpod, and supporting libraries; the repo shape recommendation is well-supported. |
| Features     | MEDIUM     | Table stakes and anti-features are grounded in competitor positioning and project context, but the exact priority of differentiators still depends on invited-user feedback. |
| Architecture | MEDIUM     | The local-first plus durable-backstop model is coherent and well-supported, but details around ledger scope and output storage need validation against real usage. |
| Pitfalls     | HIGH       | Strongly grounded in official Runpod and ComfyUI behavior plus common web security and state-management failure modes. |

**Overall confidence:** MEDIUM

### Gaps to Address

- **Workflow convention specifics:** The research establishes that parser normalization is critical, but planning still needs a concrete inventory of real workflow variants and exact `[Input]` extraction rules.
- **Durable storage scope:** The architecture recommends a minimal server-side ledger, but planning must decide what metadata stays server-side versus browser-local for invited-user v1.
- **Output retention strategy:** Large image payload sizes and expected gallery retention need validation before deciding whether IndexedDB alone is enough.
- **Access-control depth:** Invite gating is likely sufficient for v1, but planning should confirm whether the user cohort needs stronger authentication or simple app-password protection.

## Sources

### Primary (HIGH confidence)

- https://react.dev/blog/2024/12/05/react-19 - React 19 stability and current release guidance.
- https://vite.dev/blog/announcing-vite7 - Vite 7 release and Node compatibility requirements.
- https://nodejs.org/en/about/previous-releases - Node 24 LTS status.
- https://hono.dev/docs/ - Hono fit for lightweight Web API and proxy services.
- https://reactrouter.com/home - React Router 7 positioning.
- https://tanstack.com/query/latest/docs/framework/react/overview - TanStack Query 5 behavior and fit.
- https://zod.dev/v4 - Zod 4 stability and validation rationale.
- https://tailwindcss.com/docs/installation/using-vite - Tailwind 4 Vite integration guidance.
- https://docs.runpod.io/serverless/overview - Runpod serverless queue model and lifecycle.
- https://docs.runpod.io/serverless/endpoints/send-requests - Runpod `/run`, `/status`, `/cancel`, retry, and retention semantics.
- https://docs.runpod.io/serverless/endpoints/endpoint-configurations - Endpoint policy and configuration behavior.
- https://docs.runpod.io/serverless/workers/handler-functions - Worker and handler lifecycle details.
- https://docs.comfy.org/specs/workflow_json - ComfyUI workflow JSON schema expectations.
- https://docs.comfy.org/development/comfyui-server/comms_routes - ComfyUI route and API behavior.
- https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API - Browser storage characteristics for local-first persistence.
- https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html - Security guidance relevant to browser-local key handling.

### Secondary (MEDIUM confidence)

- https://github.com/honojs/hono/releases - Hono release-line confirmation.
- https://dexie.org/blog/dexie-44-dexie-cloud-server-30-the-big-one - Dexie 4.4 release confirmation.
- https://www.runcomfy.com/comfyui-web - Hosted workflow-client expectations.
- https://www.comfy.org/cloud - Comfy Cloud feature positioning.
- https://www.comfydeploy.com/ - ComfyDeploy's simplified workflow UI and team-oriented feature set.
- https://www.runpod.io/use-cases/inference - Runpod inference product framing.
- https://github.com/Comfy-Org/ComfyUI - ComfyUI feature baseline and workflow reuse expectations.

### Tertiary (LOW confidence)

- Project brief and current product framing from local planning context - useful for scope alignment, but still needs validation against actual invited-user behavior during planning.

---

_Research completed: 2026-05-23_
_Ready for roadmap: yes_