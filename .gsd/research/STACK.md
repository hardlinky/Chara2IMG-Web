# Stack Research

**Domain:** Browser app + lightweight backend proxy for Runpod Serverless ComfyUI workflows
**Researched:** 2026-05-23
**Confidence:** HIGH

## Recommended Stack

Recommended shape for v1: build a client-heavy React SPA and a thin Node proxy in the same repo. Keep the Runpod API key in the browser only, persist user templates and job history in browser-local IndexedDB, and have the proxy forward authenticated `/run`, `/status`, and `/cancel` requests to Runpod without long-term key storage.

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
| ---------- | ------- | ------- | --------------- |
| React | 19.x | Browser UI for workflow editing, job list, and gallery | React 19 is stable and current, and its newer async UI primitives are a good fit for input-heavy, optimistic, job-driven interfaces. This app is mostly client logic, so plain React is the right center of gravity. |
| Vite | 7.x | Frontend dev server and production build | Vite 7 is the current mainstream React build tool. It is fast, minimal, and better aligned than SSR-first frameworks for a private, tool-style app that mainly talks to APIs. |
| Node.js | 24.x LTS | Runtime for the lightweight proxy backend | Node 24 is current LTS and the safest production baseline here. It keeps the backend simple, supports modern web APIs well, and avoids building fresh production code on Current or EOL releases. |
| Hono | 4.12.x | Thin proxy API and optional static file serving | Hono is explicitly strong at Web API and proxy use cases, stays lightweight, and runs on Node with a small surface area. That is a better fit than a heavier Node server framework for a small invited-user product. |
| Runpod Serverless queue endpoints | Current API | Remote job execution backend | Runpod’s queue-based lifecycle directly matches the required product behavior: `/run`, `/status`, `/cancel`, `/retry`, and `/purge-queue`. This is the right remote execution model for ComfyUI image jobs. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| React Router | 7.x | Client routing and route-level data boundaries | Use for the app shell, jobs page, templates page, and gallery navigation. Prefer Data mode for loaders/actions without adopting a full framework. |
| @tanstack/react-query | 5.x | Server-state caching, polling, retries, and mutation tracking | Use for Runpod job submission, status polling, cancellation, retry, stale-state control, and optimistic UI around the job list. |
| Dexie | 4.4.x | Browser-local IndexedDB wrapper | Use for workflow templates, job history, last-used inputs, output metadata, and the optional local key remember feature. This keeps v1 aligned with the no server-side key persistence constraint. |
| Zod | 4.x | Runtime validation and request shaping | Use on both client and proxy for workflow JSON validation, generated form input validation, and strict Runpod request payloads. Zod 4 is materially faster and more schema-friendly than Zod 3. |
| Tailwind CSS | 4.3.x | Styling system for a fast UI layer | Use for the app shell, job rows, form layouts, and gallery. Tailwind 4 has first-party Vite integration and keeps the UI layer fast without adding runtime cost. |

### Development Tools

| Tool | Purpose | Notes |
| ---- | ------- | ----- |
| TypeScript 5.9.x | Type safety across client, proxy, and shared schemas | Use 5.9 for now. It is stable and current in official release posts, while TypeScript 6.0 is still in transition territory. |
| Vitest | Unit and integration tests | Best fit with Vite for parser logic, workflow transforms, and proxy request shaping. |
| Playwright | End-to-end browser verification | Use for BYOK flows, Runpod job lifecycle UX, local persistence behavior, and gallery regressions. |
| ESLint + `@tanstack/eslint-plugin-query` | Query correctness and general linting | The Query ESLint plugin catches unstable query client usage and other server-state mistakes early. |

## Installation

```bash
# Core
npm install react react-dom react-router hono @hono/node-server @tanstack/react-query dexie zod tailwindcss @tailwindcss/vite

# Supporting
npm install @tanstack/react-query-devtools

# Dev dependencies
npm install -D vite typescript @types/node @types/react @types/react-dom vitest @playwright/test eslint @tanstack/eslint-plugin-query
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
| ----------- | ----------- | ----------------------- |
| Vite + React SPA | Next.js 15 | Use Next.js only if the product grows a real SSR or SEO requirement, or if you need React Server Components for a major public-facing surface. For this private tool app, it adds framework weight without solving the main problem. |
| Hono on Node 24 | Express 5 | Use Express only if the team already has deep Express conventions or middleware investments. For a fresh, thin proxy, Hono gives you a smaller and cleaner surface. |
| Browser-local Dexie persistence | Postgres + ORM from day one | Add a server database only when you need shared accounts, team features, audit history, or cross-device sync. It is not the right default for a BYOK-first invited-user v1. |
| Runpod async `/run` + `/status` + `/cancel` | Runpod `/runsync` | Use `/runsync` only for short-lived diagnostic or preview requests. Normal ComfyUI image jobs should use async job flow so the UI can poll, cancel, rerun, and restore state safely. |

## What NOT to Use

| Avoid | Why | Use Instead |
| ----- | --- | ----------- |
| Next.js App Router as the default app shell | It pushes you toward SSR and RSC complexity that this tool does not need, and it muddies the boundary between browser-local BYOK state and server code. | Vite + React Router + Hono |
| Create React App | React has already sunsetting guidance around CRA, and it is not the current stack for new React work. | Vite 7 |
| Server-side persistence of user Runpod API keys | It violates the security and product constraint, increases breach surface, and creates operational obligations you do not need for v1. | Browser-local storage with explicit remember toggle and per-request forwarding through the proxy |
| Postgres/Redis queues for the primary job lifecycle | You already have a job system in Runpod. Rebuilding the lifecycle locally duplicates state and creates consistency bugs. | Treat Runpod as the source of truth and mirror only UI state locally |
| A heavy auth stack in v1 | Small invited users plus BYOK does not justify early auth platform and session complexity unless access control becomes a real requirement. | Start with invitation gating or a simple app password if needed, then add auth later |

## Stack Patterns by Variant

**If v1 stays single-tenant and lightweight:**

- Use one repo with a Vite client and a Hono proxy.
- Serve the built SPA from the same Node process to keep deployment simple on one lightweight Runpod pod.

**If you later need shared accounts or cross-device history:**

- Add Postgres plus an ORM such as Drizzle, but keep BYOK opt-in and browser-first.
- Persist shared metadata server-side, not raw third-party API keys by default.

**If you later need a public marketing site or SEO landing pages:**

- Keep the app itself as Vite + React.
- Add a separate public site stack rather than forcing the private tool UI into an SSR framework too early.

## Version Compatibility

| Package A | Compatible With | Notes |
| --------- | --------------- | ----- |
| React 19.x | React Router 7.x | React Router 7 is positioned as the bridge from React 18 to React 19 and is suitable for this stack. |
| React 19.x | `@tanstack/react-query` 5.x | TanStack Query 5 supports React 18+ and is appropriate for React 19 apps. |
| Vite 7.x | Node 20.19+ or 22.12+ | Vite 7 requires modern Node; using Node 24 LTS cleanly satisfies that requirement. |
| Tailwind CSS 4.x | Vite 7.x via `@tailwindcss/vite` | Tailwind officially recommends the Vite plugin path for Vite projects. |
| Runpod async endpoints | Hono proxy routes | Map proxy routes directly to `/run`, `/status`, `/cancel`, and `/retry`; avoid inventing a second job system. |

## Sources

- https://react.dev/blog/2024/12/05/react-19 - verified React 19 stable; react.dev also exposes 19.2 in current docs navigation. HIGH confidence.
- https://vite.dev/blog/announcing-vite7 - verified Vite 7 release and Node support requirements. HIGH confidence.
- https://nodejs.org/en/about/previous-releases - verified Node 24 as current LTS and Node 20 as EOL. HIGH confidence.
- https://hono.dev/docs/ - verified Hono’s proxy/API use case fit, Node support, and Web Standards positioning. HIGH confidence.
- https://github.com/honojs/hono/releases - verified current Hono 4.12.x release line. MEDIUM confidence because version came from official GitHub releases rather than docs homepage.
- https://reactrouter.com/home - verified React Router v7 positioning and upgrade guidance. HIGH confidence.
- https://tanstack.com/query/latest/docs/framework/react/overview - verified TanStack Query purpose and current v5 docs line. HIGH confidence.
- https://tanstack.com/query/latest/docs/framework/react/installation - verified React 18+ compatibility and package names for TanStack Query v5. HIGH confidence.
- https://zod.dev/v4 - verified Zod 4 stable, install target, and performance improvements. HIGH confidence.
- https://tailwindcss.com/blog/tailwindcss-v4 - verified Tailwind 4 major release and Vite-first integration path. HIGH confidence.
- https://tailwindcss.com/docs/installation/using-vite - verified current Tailwind docs are on v4.3 and recommend `@tailwindcss/vite`. HIGH confidence.
- https://dexie.org/blog/dexie-44-dexie-cloud-server-30-the-big-one - verified Dexie 4.4.x current release line. MEDIUM confidence because the version evidence comes from the official blog post.
- https://docs.runpod.io/serverless/overview - verified queue-based endpoint model, workers, handler flow, and endpoint lifecycle behavior. HIGH confidence.
- https://docs.runpod.io/serverless/endpoints/send-requests - verified `/run`, `/runsync`, `/status`, `/cancel`, `/retry`, `/purge-queue`, retention windows, and rate-limit model. HIGH confidence.
- https://docs.runpod.io/api-reference/overview - verified Runpod API authentication and OpenAPI availability. HIGH confidence.

---

_Stack research for: Browser app + lightweight backend proxy for Runpod Serverless ComfyUI workflows_
_Researched: 2026-05-23_