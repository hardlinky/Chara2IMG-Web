# Codebase Structure

**Analysis Date:** 2026-06-17

## Directory Layout

```
chara2img-web/
├── src/
│   ├── client/                  # React SPA (Vite bundled, runs in browser)
│   │   ├── main.tsx             # Browser entry point
│   │   ├── App.tsx              # Root component, top-level state
│   │   ├── globals.d.ts         # __APP_VERSION__ ambient declaration
│   │   ├── components/
│   │   │   └── app-shell/       # Layout shell (AppShell, TopTabRail, BottomTabNav)
│   │   ├── features/            # Product domain folders
│   │   │   ├── access/          # Invite/admin auth gate UI
│   │   │   ├── inputs/          # Dynamic workflow input editor
│   │   │   ├── jobs/            # Recent jobs panel and polling
│   │   │   ├── outputs/         # Output gallery and lightbox
│   │   │   └── workflows/       # Workflow import and active template
│   │   ├── lib/
│   │   │   ├── api/             # Typed fetch clients (one file per server route group)
│   │   │   ├── workflowStorage.ts     # IndexedDB via Dexie
│   │   │   ├── recentJobsStorage.ts   # IndexedDB via Dexie (client-side job records)
│   │   │   ├── runpodKeyStorage.ts    # localStorage adapter
│   │   │   ├── endpointStorage.ts     # localStorage adapter
│   │   │   ├── inputEditorStorage.ts  # localStorage adapter
│   │   │   ├── jobSubmission.ts       # Submit + persist recent job
│   │   │   ├── jobOutputProjection.ts # Output cluster projection
│   │   │   ├── runpodOutputImage.ts   # Image extraction from job output
│   │   │   ├── workflowExport.ts      # Sanitize workflow for export/download
│   │   │   ├── clientPinnedManifest.ts # Client-side pinned manifest cache
│   │   │   └── appVersion.ts          # APP_VERSION_LABEL constant
│   │   └── styles/              # Global CSS (tokens, base, layout, components)
│   ├── server/                  # Hono server (Node.js, runs at runtime)
│   │   ├── index.ts             # Server entry point, createServerApp()
│   │   ├── routes/              # Route registrar functions (one file per domain)
│   │   │   ├── access.ts        # /api/access/* (invite, session, logout)
│   │   │   ├── admin.ts         # /api/admin/* (admin session, verify key)
│   │   │   ├── runpodProxy.ts   # /api/runpod/* (run, status, cancel, purge)
│   │   │   ├── recentJobs.ts    # /api/jobs/* (list, get, update, delete)
│   │   │   ├── pinnedImages.ts  # /api/pinned/* (backup, release, reconcile)
│   │   │   └── system.ts        # /api/system/* (config, storage stats, update)
│   │   ├── middleware/
│   │   │   ├── security.ts      # CORS, CSRF, secure headers for /api/*
│   │   │   └── session.ts       # Signed cookie issuance and verification
│   │   ├── schemas/             # Zod validation schemas (one file per route group)
│   │   │   ├── runpodProxy.ts
│   │   │   ├── access.ts
│   │   │   ├── admin.ts
│   │   │   └── pinnedImages.ts
│   │   ├── security/
│   │   │   ├── adminPasskey.ts  # Admin passkey resolution + startup log
│   │   │   └── invite.ts        # Invite secret verification
│   │   └── lib/                 # Stateful server services
│   │       ├── runpodClient.ts        # Raw RunPod HTTP forwarder
│   │       ├── runpodJobTracker.ts    # Background polling for active jobs
│   │       ├── runpodJobStateStore.ts # In-memory + filesystem job state cache
│   │       ├── recentJobsStore.ts     # Filesystem JSON persistence for job records
│   │       ├── pinnedImageStorageStats.ts # Storage stats for pinned images
│   │       ├── redaction.ts           # Secret scrubbing for logs
│   │       └── logger.ts              # logServerError / logServerWarning
│   └── shared/                  # Pure TypeScript — no framework imports
│       ├── contracts/           # Shared types, constants, enums
│       │   ├── inputs.ts        # DynamicInputControl, DynamicInputDraftValues types
│       │   ├── jobs.ts          # RecentJobRecord, RunpodJobStatus, lifecycle types
│       │   ├── runpod.ts        # RunPod API response shape types
│       │   └── workflow.ts      # WorkflowTemplateRecord type
│       └── workflow/            # Pure workflow processing (no side effects)
│           ├── deriveInputControls.ts   # Scan ComfyUI JSON nodes → DynamicInputControl[]
│           ├── validateInputDraft.ts    # Validate user-entered draft values
│           ├── buildRunWorkflowPayload.ts # Merge draft values into workflow JSON
│           ├── importWorkflow.ts        # Parse and normalize raw imported JSON
│           └── workflowSchemas.ts      # Zod schemas for workflow validation
├── tests/
│   ├── client/                  # Vitest unit/component tests for client code
│   │   └── fixtures/            # Test fixture data (workflow JSON, job records)
│   ├── server/                  # Vitest tests for server route handlers
│   └── shared/                  # Vitest tests for shared pure logic
├── scripts/
│   ├── ensure-patch-bump.mjs    # CI guard: enforce patch version bump
│   ├── verify-patch-bump.mjs    # CI verify script
│   └── setup-git-hooks.mjs      # Install .githooks locally
├── .gsd/                        # GSD planning artifacts
├── .github/                     # GitHub Actions CI + Copilot instructions
├── .githooks/                   # Local git hooks (pre-push version guard)
├── dist/                        # Vite build output (gitignored)
│   └── client/                  # Built SPA, served by Hono
├── index.html                   # Vite SPA root HTML template
├── vite.config.ts               # Vite build config (outDir: dist/client, version inject)
├── tsconfig.json                # TypeScript config
├── package.json                 # npm project manifest
└── .env.example                 # Required environment variable documentation
```

## Directory Purposes

**`src/client/features/`:**

- Purpose: Product domain UI — each subfolder owns its components and hooks for one feature area
- Contains: `.tsx` React components, `use*.ts` hooks, feature utility `.ts` files
- Key files: `features/jobs/useRecentJobs.ts` (polling hook), `features/inputs/DynamicInputEditor.tsx`, `features/outputs/OutputsTab.tsx`

**`src/client/lib/api/`:**

- Purpose: Typed HTTP client functions for calling server API endpoints
- Contains: One file per server route group; each file exports named async functions
- Key files: `runpodProxyClient.ts` (job run/status/cancel), `recentJobsClient.ts`, `pinnedImageClient.ts`

**`src/client/lib/` (non-api):**

- Purpose: Browser storage adapters and client-side business logic
- Contains: IndexedDB adapters (Dexie), localStorage adapters, job submission orchestration

**`src/server/routes/`:**

- Purpose: HTTP route definitions grouped by domain
- Contains: `register*Routes(app: Hono)` functions that mount handlers onto the app
- Pattern: All route files export a single `register*Routes` function; no default exports

**`src/server/schemas/`:**

- Purpose: Zod input validation schemas used by route handlers
- Contains: Exported `z.object(...)` schemas, one per endpoint operation
- Note: Always use `.strict()` to reject extra fields

**`src/server/lib/`:**

- Purpose: Stateful singleton services — in-memory caches, filesystem I/O, background timers
- Key files: `runpodJobStateStore.ts` (Map-based cache + tmp-dir persistence), `recentJobsStore.ts` (JSON file read/write), `runpodJobTracker.ts` (setInterval polling)

**`src/shared/workflow/`:**

- Purpose: Pure workflow processing — safe to call from both client and server
- Contains: Functions that take plain data in, return plain data out (no I/O, no React, no Hono)

**`src/shared/contracts/`:**

- Purpose: Single source of truth for shared TypeScript types and constants
- Note: Import types from here whenever both client and server need the same shape; never duplicate types

## Key File Locations

**Entry Points:**

- `src/server/index.ts`: Server startup, `createServerApp()` factory
- `src/client/main.tsx`: Browser SPA mount point
- `index.html`: Vite HTML template root

**Configuration:**

- `vite.config.ts`: Build config, `__APP_VERSION__` injection, `dist/client` output dir
- `tsconfig.json`: TypeScript project config
- `.env.example`: All required env vars documented (`INVITE_SECRET`, `COOKIE_SECRET`, `RUNPOD_API_KEY`, `PORT`, etc.)

**Core Logic:**

- `src/client/lib/jobSubmission.ts`: Orchestrates run submission + persistence
- `src/client/features/jobs/useRecentJobs.ts`: Central hook for job list, polling, pin/unpin
- `src/server/lib/runpodJobTracker.ts`: Server-side background job polling
- `src/shared/workflow/deriveInputControls.ts`: ComfyUI node → UI control derivation
- `src/shared/workflow/buildRunWorkflowPayload.ts`: Draft values → RunPod input payload

**Testing:**

- `tests/client/`: Client-side tests co-located by feature name (e.g., `jobPolling.test.ts`)
- `tests/server/`: Server route handler tests
- `tests/shared/`: Pure logic unit tests
- `tests/client/fixtures/`: Shared test data (workflow JSON, job record fixtures)

## Naming Conventions

**Files:**

- React components: `PascalCase.tsx` (e.g., `DynamicInputEditor.tsx`, `AppShell.tsx`)
- React hooks: `use*.ts` (e.g., `useRecentJobs.ts`, `useActiveWorkflowTemplate.ts`)
- Server route registrars: `camelCase.ts` matching domain (e.g., `runpodProxy.ts`, `recentJobs.ts`)
- Storage adapters: `*Storage.ts` or `*Store.ts` (e.g., `workflowStorage.ts`, `recentJobsStore.ts`)
- API clients: `*Client.ts` (e.g., `runpodProxyClient.ts`, `pinnedImageClient.ts`)
- Schema files: `camelCase.ts` in `schemas/` matching route file name
- Test files: `*.test.ts` or `*.test.tsx`, named after the module under test

**Directories:**

- Feature folders: `camelCase` noun (e.g., `jobs`, `outputs`, `inputs`, `workflows`, `access`)
- All directories: lowercase, camelCase or hyphen-separated (e.g., `app-shell`)

**Exports:**

- All exports are named exports — no default exports in source files
- Route registrars: `register*Routes`
- Storage functions: verb + noun (e.g., `saveActiveWorkflowTemplate`, `listRecentJobs`, `deleteRecentJob`)

## Where to Add New Code

**New API endpoint:**

1. Add Zod schema to `src/server/schemas/<domain>.ts`
2. Add route handler to `src/server/routes/<domain>.ts` (or create new file and register in `src/server/index.ts`)
3. Add typed client function to `src/client/lib/api/<domain>Client.ts`
4. Add tests to `tests/server/<domain>.test.ts` and `tests/client/<domain>.test.ts`

**New UI feature:**

1. Create feature folder: `src/client/features/<featureName>/`
2. Add component (`FeatureName.tsx`), hook (`useFeatureName.ts`), utilities
3. Import and wire in `App.tsx` or the relevant parent component
4. Add tests to `tests/client/<featureName>.test.tsx`

**New shared type or contract:**

- Add to the appropriate file in `src/shared/contracts/` (inputs, jobs, runpod, or workflow)
- If it's a new domain, create `src/shared/contracts/<domain>.ts`

**New workflow processing function:**

- Add to `src/shared/workflow/` — must be pure (no I/O, no framework imports)
- Add tests to `tests/shared/<functionName>.test.ts`

**New browser storage adapter:**

- Add to `src/client/lib/<domain>Storage.ts`
- Use Dexie for structured/indexed data; `localStorage` for simple key/value settings

**New server-side service (stateful):**

- Add to `src/server/lib/<serviceName>.ts`
- Export named functions; use module-level variables for singleton state (Map, file paths, timers)

## Special Directories

**`dist/`:**

- Purpose: Vite build output for the client SPA
- Generated: Yes (by `vite build`)
- Committed: No (gitignored)

**`.gsd/`:**

- Purpose: GSD framework planning artifacts (ROADMAP, phases, codebase maps)
- Generated: Partially (by GSD commands)
- Committed: Yes

**`.githooks/`:**

- Purpose: Local git hook scripts (pre-push version bump enforcement)
- Generated: No
- Committed: Yes; run `node scripts/setup-git-hooks.mjs` to activate locally

---

_Structure analysis: 2026-06-17_
