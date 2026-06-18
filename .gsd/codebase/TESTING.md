# Testing Patterns

**Analysis Date:** 2026-06-17

## Test Framework

**Runner:**
- Vitest `^2.0.0`
- No dedicated vitest config file; runs with defaults via `package.json`

**Assertion Library:**
- Vitest built-in (`expect`)

**Run Commands:**

```bash
npm test              # Run all tests once (vitest run)
npx vitest            # Watch mode
npx vitest --coverage # Coverage (not configured; runs without targets)
```

## Test File Organization

**Location:**
- Separate `tests/` directory — not co-located with source
- Mirrors `src/` structure: `tests/client/`, `tests/server/`, `tests/shared/`

**Naming:**
- `{subject}.test.ts` for pure logic — `jobPolling.test.ts`, `recentJobsStorage.test.ts`
- `{subject}.test.tsx` for React components — `dynamicInputEditor.test.tsx`, `outputGallery.test.tsx`
- Name matches the primary module under test

**Structure:**
```
tests/
├── client/
│   ├── fixtures/
│   │   └── workflows/     # JSON workflow fixture files
│   ├── appJobSubmission.test.tsx
│   ├── appShellNavigation.test.tsx
│   ├── dynamicInputEditor.test.tsx
│   ├── jobPolling.test.ts
│   ├── recentJobsStorage.test.ts
│   └── ...
├── server/
│   └── runpodProxy.test.ts
└── shared/
    ├── buildRunWorkflowPayload.test.ts
    ├── deriveInputControls.test.ts
    └── validateInputDraft.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("subject area", () => {
  beforeEach(async () => {
    // Reset shared state (e.g., clear IndexedDB, reset mocks)
    await clearRecentJobs();
    vi.mocked(statusBatchViaProxy).mockReset();
  });

  afterEach(() => {
    // Cleanup globals
    vi.unstubAllGlobals();
  });

  it("describes the expected behavior as a statement", async () => {
    // Arrange
    // Act
    // Assert
    expect(result).toBe(expected);
  });
});
```

**Patterns:**
- `beforeEach` used to reset IndexedDB or mock state; `afterEach` for global stub cleanup
- No `afterAll` or `beforeAll` observed
- Test names are full behavioral sentences — "does not create a recent-job record when submission fails"
- `async/await` throughout; no callback-style tests

## Mocking

**Framework:** Vitest `vi`

**Module-level mocking:**
```typescript
vi.mock("../../src/client/lib/api/runpodProxyClient", () => ({
  statusViaProxy: vi.fn(),
  statusBatchViaProxy: vi.fn(),
  cancelViaProxy: vi.fn(),
  runViaProxy: vi.fn(),
  updateAppViaProxy: vi.fn()
}));
```

**Per-test mock resolution:**
```typescript
vi.mocked(statusBatchViaProxy).mockReset();
vi.mocked(statusBatchViaProxy).mockResolvedValueOnce({ items: [ ... ] });
```

**Global stubbing (fetch, etc.):**
```typescript
vi.stubGlobal(
  "fetch",
  vi.fn(async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })
  )
);
// Cleanup:
vi.unstubAllGlobals(); // in afterEach
```

**Dependency injection mocking (preferred over module mocking):**
```typescript
// Pass mock as dependencies argument — no vi.mock() needed
const submitRun = vi.fn(async () => ({ id: "job-123", status: "IN_QUEUE", output: null }));

await submitRunAndPersistRecentJob({
  endpointId: "endpoint-1",
  dependencies: { submitRun }
});

expect(submitRun).toHaveBeenCalledTimes(1);
```

**What to Mock:**
- External HTTP calls (`fetch`, `runViaProxy`, `statusBatchViaProxy`)
- Injected dependencies via the `dependencies` parameter pattern
- Global browser APIs when testing in Node environment

**What NOT to Mock:**
- IndexedDB — use `fake-indexeddb/auto` for real storage behavior
- Shared business logic in `src/shared/` — test directly

## Fixtures and Factories

**Factory functions (preferred over raw fixtures):**
```typescript
function createJob(jobId: string, submittedAt: string) {
  return {
    jobId,
    endpointId: "endpoint-1",
    templateFingerprint: "fp-1",
    lifecycle: { status: "IN_QUEUE", isTerminal: false, warning: null, failureReason: null },
    lastResponse: { id: jobId },
    lastError: null,
    submittedAt
  };
}

// Override specific fields
function createCluster(overrides: Partial<RecentJobOutputCluster>): RecentJobOutputCluster {
  return {
    jobId: "job-1",
    isPinned: false,
    // ...defaults
    ...overrides
  };
}
```

**Fixture files:**
- Location: `tests/client/fixtures/workflows/` — JSON workflow definition files
- Used for workflow import/export and payload building tests

**Inline test data:**
- Small base64 images defined inline — `const tinyPngDataUrl = "data:image/png;base64,..."`
- ISO timestamp strings used for `submittedAt` — `"2026-05-23T10:00:00.000Z"`

## Coverage

**Requirements:** None enforced — no coverage thresholds configured

**View Coverage:**
```bash
npx vitest --coverage
```

## Test Types

**Unit Tests (pure logic):**
- `tests/shared/` — workflow payload building, input validation, contract helpers
- `tests/client/` utility files — storage operations, output projection, job status logic
- Use factory functions; no UI rendering

**Integration Tests (storage + business logic):**
- `tests/client/recentJobsStorage.test.ts`, `appJobSubmission.test.tsx`, `jobPolling.test.ts`
- Use `fake-indexeddb/auto` for real IndexedDB behavior in Node
- Exercise storage + domain logic together

**Component Rendering Tests (structural):**
- `tests/client/*.test.tsx` — `appShellNavigation`, `dynamicInputEditor`, `outputGallery`
- Use `renderToStaticMarkup` from `react-dom/server` — no @testing-library/react
- Assert HTML structure, ARIA attributes, and CSS class presence via `toContain()`

**Server Integration Tests:**
- `tests/server/runpodProxy.test.ts`
- Use Hono's `app.request()` to make real HTTP calls against the app instance
- Stub `fetch` globally to intercept outbound RunPod API calls
- Set env vars directly in `beforeEach`: `process.env.INVITE_SECRET = "test-secret"`

**E2E Tests:** Not used

## Common Patterns

**IndexedDB tests (requires fake-indexeddb):**
```typescript
import "fake-indexeddb/auto"; // Must be first import
import { beforeEach } from "vitest";
import { clearRecentJobs } from "../../src/client/lib/recentJobsStorage";

beforeEach(async () => {
  await clearRecentJobs(); // Reset between tests
});
```

**Async/rejection testing:**
```typescript
await expect(
  submitRunAndPersistRecentJob({ dependencies: { submitRun: vi.fn(async () => { throw new Error("fail"); }) } })
).rejects.toThrow("fail");
```

**Server route testing (Hono):**
```typescript
const app = createServerApp();
const response = await app.request("http://localhost/api/runpod/run", {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie, Origin: "http://localhost:5173" },
  body: JSON.stringify({ endpointId: "abc123", apiKey: "rp_test_key", input: {} })
});
expect(response.status).toBe(200);
```

**HTML structure assertions:**
```typescript
const html = renderToStaticMarkup(<MyComponent {...props} />);
expect(html).toContain('role="tablist"');
expect(html).toContain('aria-selected="true"');
expect(html).not.toContain('id="tab-admin"');
```

---

_Testing analysis: 2026-06-17_
