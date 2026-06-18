# Technology Stack

**Analysis Date:** 2026-06-17

## Languages

**Primary:**

- TypeScript 5.8 - All source code (`src/`, `tests/`, `vite.config.ts`)

**Secondary:**

- JavaScript (ESM) - Build/utility scripts (`scripts/*.mjs`)

## Runtime

**Environment:**

- Node.js (LTS) — server process; no version pinned in `.nvmrc` or `.node-version`

**Package Manager:**

- npm (no version pinned)
- Lockfile: present (`package-lock.json`)

## Frameworks

**Backend HTTP:**

- Hono 4.12 — Lightweight web framework for all API routes
- @hono/node-server 1.13 — Node.js adapter for Hono (serves `app.fetch`)

**Frontend:**

- React 19 — UI component library (`src/client/`)
- Vite 7 — Client bundle build tool; output to `dist/client/`
- JSX transform: `react-jsx` (no React import needed in components)

**Validation:**

- Zod 4.0 — Schema validation for API request bodies (`src/server/schemas/`) and shared workflow contracts (`src/shared/`)

**Client-side Storage:**

- Dexie 4.4 — IndexedDB wrapper used for client-side job/workflow storage (`src/client/`)

**Image Gallery:**

- PhotoSwipe 5.4 — Lightbox/gallery engine
- react-photoswipe-gallery 4.0 — React wrapper

**ZIP Export:**

- yazl 3.3 — ZIP file creation for workflow/image exports

**Testing:**

- Vitest 2.0 — Test runner and assertion library
- fake-indexeddb 6.2 — In-memory IndexedDB implementation for tests

**Build/Dev:**

- tsx 4.19 — TypeScript execution for dev server (`tsx watch`) and production start (`node --import tsx`)
- concurrently 9.2 — Run parallel dev tasks

## Key Dependencies

**Critical:**

- `hono` 4.12 — Entire server routing, middleware (CORS, CSRF, secure headers, cookies)
- `react` 19 — Frontend rendering
- `zod` 4.0 — Request and workflow schema validation
- `dexie` 4.4 — Client-side persistent storage (IndexedDB)

**Infrastructure:**

- `yazl` 3.3 — ZIP generation for pinned image download bundles
- `photoswipe` 5.4 — Output image lightbox UI

## Configuration

**Environment:**

- `PORT` — HTTP server port (default: `3000`)
- `COOKIE_SECRET` — Secret for signing session cookies (required in production)
- `ADMIN_ACCESS_KEY` — Admin passkey override (auto-generated random key if absent)
- `ALLOWED_ORIGIN` — Explicit CORS/CSRF origin allowlist (optional; same-origin by default)
- `RECENT_JOBS_STORAGE_DIR` — Override for file-system job storage directory (default: `../chara2img/recent-jobs` relative to project root)
- `NODE_ENV` — Controls secure cookie flag (`production` = `secure: true`)

**Build:**

- `vite.config.ts` — Client bundle config; injects `__APP_VERSION__` from `package.json`
- `tsconfig.json` — Strict TypeScript, `ESNext` modules, `Bundler` resolution, no emit

## Platform Requirements

**Development:**

- Node.js with ESM support (`"type": "module"` in `package.json`)
- `npm install` triggers `scripts/setup-git-hooks.mjs` via `postinstall`

**Production:**

- Node.js process; static client assets served from `dist/client/` via Hono static middleware
- No containerization config detected; plain Node process deployment

---

_Stack analysis: 2026-06-17_
