# Coding Conventions

**Analysis Date:** 2026-06-17

## Naming Patterns

**Files:**
- React components: PascalCase `.tsx` — e.g., `DynamicInputEditor.tsx`, `AppShell.tsx`
- Hooks: camelCase `.ts` — e.g., `useDynamicInputEditor.ts`, `useRecentJobs.ts`
- Utilities/lib: camelCase `.ts` — e.g., `recentJobsStorage.ts`, `runpodClient.ts`
- Schemas: camelCase `.ts` — e.g., `runpodProxy.ts` inside `schemas/`
- Tests: mirror source name + `.test.ts(x)` — e.g., `jobPolling.test.ts`

**Functions:**
- camelCase throughout — `buildLifecycleSnapshotFromStatus`, `forwardRunpodRequest`, `applyControlValue`
- Boolean functions prefixed with `is` or `has` — `isTerminalJobSnapshot`, `hasDraftDiffFromTemplate`
- Transformers prefixed with `to` or `build` — `toProxyResponse`, `buildRunWorkflowPayload`
- Resolvers prefixed with `resolve` — `resolveRunpodApiKey`, `resolveAllowedOrigin`
- Formatters prefixed with `format` — `formatOutputJobId`, `formatSubmittedAtRelative`

**Variables:**
- camelCase for all local variables and parameters
- ALL_CAPS for module-level constants — `RECENT_JOBS_VISIBLE_LIMIT`, `JOB_POLL_INTERVAL_MS`

**Types/Interfaces:**
- PascalCase for all types — `RecentJobRecord`, `JobLifecycleSnapshot`, `DynamicInputControl`
- Type suffixes: `Record` for stored entities, `Snapshot` for point-in-time captures, `Props` for React prop types
- `as const` arrays used to derive union types — `RUNPOD_JOB_STATUSES as const` → `RunpodJobStatus`

**React Components:**
- PascalCase function components only — no class components

## Code Style

**TypeScript:**
- Strict mode enabled (`strict: true` in tsconfig)
- `noEmit: true` — type checking only, Vite handles compilation
- Target: ES2022, module: ESNext, moduleResolution: Bundler
- No `any` — strict mode enforces this
- `void` operator used intentionally to discard ignored async results and unused parameters

**Formatting:**
- No Prettier or ESLint config present; style enforced by TypeScript strict mode and code review
- Consistent 2-space indentation
- Trailing commas in multi-line structures
- Double quotes for JSX attributes, double quotes for import strings

**Exports:**
- Named exports exclusively — no default exports from utility modules
- React components may be named-exported from their file

## Import Organization

**Order:**
1. Node built-ins (`node:fs`, `node:path`) — prefixed with `node:`
2. External packages (`react`, `dexie`, `hono`, `zod`)
3. Internal `src/shared/` — cross-cutting contracts and logic
4. Internal `src/client/` or `src/server/` — feature-layer code
5. CSS imports last in component files

**Path Aliases:**
- No path aliases configured; all imports use relative paths
- No barrel (`index.ts`) files — direct imports to specific modules

**Example:**
```ts
import { z } from "zod";
import type { DynamicInputControl } from "../../shared/contracts/inputs";
import { buildRunWorkflowPayload } from "../../shared/workflow/buildRunWorkflowPayload";
```

## Error Handling

**Result Types:**
- Functions that can fail return `{ ok: true; payload: T } | { ok: false; errors: E[] }` discriminated unions
- Used in `buildRunWorkflowPayload`, `validateInputDraft` — callers must check `.ok` before accessing payload

**Server Routes:**
- Zod `.safeParse()` for request validation; returns 400 on failure
- `try/catch` wraps outbound HTTP calls; caught errors returned as 502 via `toSafeProxyError()`
- `logServerError()` called before returning error responses — never silent catches

**Client:**
- Async operations in `useEffect` use `void` to suppress unhandled promise warnings
- No global error boundaries observed; errors propagate to component render

**Patterns:**
```ts
// Server route error handling
try {
  const response = await forwardRunpodRequest({ ... });
  return toProxyResponse(response, body);
} catch (error) {
  return c.json(toSafeProxyError(error, "context", metadata), 502);
}

// Result type checking
const result = buildRunWorkflowPayload({ ... });
if (!result.ok) {
  return; // or handle errors
}
// result.payload is now safely accessible
```

## Logging

**Framework:** Custom structured logger at `src/server/lib/logger.ts`

**Functions:**
- `logServerError(context, error, metadata?)` — calls `console.error`
- `logServerWarning(context, error, metadata?)` — calls `console.warn`

**Format:**
```ts
console.error("[server]", {
  level: "error",
  context,
  error: { name, message, stack },
  metadata,
  timestamp: new Date().toISOString()
});
```

**Client:** No structured logging; ad-hoc `console.error` where needed

## Comments

**When to Comment:**
- Intentional workarounds only — `// @ts-ignore: reason` with explicit explanation
- Cross-component hacks — `// Expose openJobOutputs globally for cross-tab hack`
- No JSDoc/TSDoc annotations used — types serve as documentation

## Function Design

**Size:** Small, single-responsibility functions; larger files compose multiple small helpers

**Parameters:** Prefer named object parameters for 3+ args; primitive args for 1-2

**Dependency Injection:**
- Functions that call external services accept a `dependencies` parameter
- Allows test injection without module mocking
```ts
async function submitRunAndPersistRecentJob({
  dependencies: {
    submitRun = runViaProxy,
    saveRecentJob = upsertRecentJob
  }
}: SubmitArgs) { ... }
```

## Module Design

**Contracts pattern:**
- `src/shared/contracts/` defines types and constants shared between client and server
- No runtime logic in contract files beyond `as const` and `z.object()` schemas
- Zod schemas live in `src/server/schemas/` — validation only at server boundary

**Shared logic:**
- Pure workflow logic in `src/shared/workflow/` — usable on both client and server
- Client-only Dexie operations in `src/client/lib/`
- Server-only route logic in `src/server/routes/`

---

_Convention analysis: 2026-06-17_
