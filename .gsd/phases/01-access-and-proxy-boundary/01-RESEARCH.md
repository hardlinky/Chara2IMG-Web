# Phase 1: Access and Proxy Boundary - Research

**Researched:** 2026-05-23
**Domain:** Invited-user access gating, BYOK key handling, and thin Runpod proxy boundaries
**Confidence:** HIGH

## Summary

Phase 1 should be implemented as a strict boundary phase: establish who can access the app, where secrets are allowed to live, and exactly how Runpod calls transit through the backend. The most reliable v1 approach is invited-only access with a signed HttpOnly session cookie, explicit BYOK input with opt-in browser persistence, and a proxy that validates and forwards only a narrow set of Runpod lifecycle requests.

The standard stack for this phase is a Vite + React frontend and a Hono proxy on Node 24 LTS, with Zod validation on both boundary edges (browser input and proxy request body). Use Hono cookie/csrf/cors/secure-headers middleware rather than custom security plumbing. Use Node crypto for token generation and constant-time comparisons where secrets are compared.

The core planning rule: do not build generalized auth or secret-vault systems in this phase. Build only what is needed for AUTH-01..AUTH-04: invited access, BYOK capture, optional same-browser remember behavior, and safe forwarding with no long-term server-side key persistence.

**Primary recommendation:** Implement invitation-gated signed-cookie sessions plus a strict allowlist Runpod proxy, with BYOK stored only in browser memory/sessionStorage/localStorage based on explicit user choice.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| Node.js | 24.x LTS | Runtime for proxy and security handling | Current LTS baseline with stable crypto and modern Web APIs. |
| Hono | 4.12.x | Thin API server/proxy | Lightweight API/proxy-first framework with built-in middleware for security concerns. |
| Zod | 4.x | Runtime schema validation | Strong request/response boundary validation and strict object handling. |
| Runpod Serverless API | Current | Job lifecycle backend | Native queue/lifecycle model (`/run`, `/status`, `/cancel`, etc.) that matches product requirements. |

### Supporting

| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| React | 19.x | Access + BYOK UX | Build invited access gate and key settings UI. |
| Vite | 7.x | Frontend build/dev server | Fast SPA build path for private tool-style app. |
| Hono `cookie` helper | Included with Hono | Signed cookie sessions | Use for session cookie issue/verify/revoke. |
| Hono `csrf` middleware | Included with Hono | CSRF protection | Use on unsafe methods when cookie sessions are enabled. |
| Hono `cors` middleware | Included with Hono | Origin restrictions | Use explicit origin allowlist and credentials behavior. |
| Hono `secure-headers` middleware | Included with Hono | Baseline security headers | Apply conservative defaults early in proxy layer. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| ---------- | --------- | -------- |
| Hono signed session cookies | JWT session tokens | JWT is viable but adds token lifecycle complexity not needed for v1 invited access. |
| Browser-local key remember toggle | Server-side encrypted key vault | Conflicts with v1 out-of-scope and increases breach/ops burden. |
| Dedicated auth platform for v1 | Simple invited-session gate | Auth platforms are better later when account lifecycle/admin complexity arrives. |

**Installation:**
```bash
npm install hono zod
npm install react react-dom
npm install -D vite typescript @types/node @types/react @types/react-dom
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── client/                 # React app (invited gate + BYOK settings)
├── server/
│   ├── middleware/         # cors/csrf/secure-headers/session middleware
│   ├── routes/
│   │   ├── access.ts       # invite/session endpoints
│   │   └── runpod-proxy.ts # strict lifecycle forwarding endpoints
│   ├── schemas/            # zod schemas for request/response boundaries
│   └── security/           # token creation, cookie config, allowlists
└── shared/
    └── contracts/          # shared request/response types and constants
```

### Pattern 1: Invited Access With Signed HttpOnly Cookie

**What:** User enters invite credential (token/code), server validates, then issues signed HttpOnly session cookie.
**When to use:** AUTH-04 invited-user access without full user-account platform.
**Example:**
```typescript
// Source: https://hono.dev/docs/helpers/cookie
import { Hono } from 'hono'
import { setSignedCookie } from 'hono/cookie'

const app = new Hono()

app.post('/access/verify-invite', async (c) => {
  // validate invite input with Zod before this point
  await setSignedCookie(c, 'session', 'invited', c.env.COOKIE_SECRET, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    prefix: 'host',
    maxAge: 60 * 60 * 8,
  })
  return c.json({ ok: true })
})
```

### Pattern 2: BYOK Storage Policy As Explicit User Choice

**What:** Keep key in memory by default; persist to `sessionStorage` or `localStorage` only when user opts in.
**When to use:** AUTH-01 and AUTH-02.
**Example:**
```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
// Source: https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage
export function saveRunpodKey(key: string, remember: 'none' | 'session' | 'local') {
  sessionStorage.removeItem('runpod_api_key')
  localStorage.removeItem('runpod_api_key')

  if (remember === 'session') sessionStorage.setItem('runpod_api_key', key)
  if (remember === 'local') localStorage.setItem('runpod_api_key', key)
}
```

### Pattern 3: Strict Allowlist Proxy Forwarding

**What:** Validate body with Zod, map only supported routes, attach Authorization header per request, never persist API key server-side.
**When to use:** AUTH-03 and plan 01-02.
**Example:**
```typescript
// Source: https://docs.runpod.io/serverless/endpoints/send-requests
import { z } from 'zod'

const runSchema = z.object({ input: z.record(z.any()) }).strict()

export async function forwardRunpodRun(apiKey: string, endpointId: string, payload: unknown) {
  const body = runSchema.parse(payload)

  const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  return response
}
```

### Anti-Patterns to Avoid

- **Open proxy pass-through:** Forwarding arbitrary paths/methods to Runpod turns the backend into a generic relay and expands abuse surface.
- **Long-term server key persistence:** Storing user Runpod keys in DB/files violates v1 boundaries and out-of-scope constraints.
- **Cookie sessions without CSRF strategy:** If cookies authenticate unsafe requests, enforce CSRF checks.
- **Broad CORS with credentials:** `*` origin plus credentials is unsafe and often invalid; use explicit allowed origin(s).

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Cookie signing/parsing | Custom HMAC cookie format | Hono cookie helper (`setSignedCookie`/`getSignedCookie`) | Already handles signatures and cookie option edge cases. |
| CSRF filtering | Homegrown origin/header checks | Hono CSRF middleware | Centralizes origin and `Sec-Fetch-Site` checks with clear defaults. |
| CORS policy plumbing | Custom CORS header logic | Hono CORS middleware | Correct handling of origins/methods/credentials options. |
| Request shape validation | Manual `if` trees | Zod schemas with strict objects | Prevents accidental pass-through fields and malformed payloads. |
| Secret/token randomness | `Math.random()` tokens | Node `crypto.randomBytes` / `crypto.randomUUID` | Cryptographically strong randomness. |
| Secret comparison | Plain string equality | `crypto.timingSafeEqual` | Reduces timing side-channel risk in secret comparisons. |

**Key insight:** Security boundaries fail most often in edge cases and header/cookie details; use maintained middleware/libraries for those edges and keep custom code to product-specific rules.

## Common Pitfalls

### Pitfall 1: Accidental Server-Side Key Retention

**What goes wrong:** API key appears in logs, metrics payloads, error traces, or temp persistence layers.
**Why it happens:** Convenience logging and generic request serialization.
**How to avoid:** Redact auth headers, never log full request headers/body for proxy routes, and keep API key only in request scope.
**Warning signs:** Key-like strings appear in logs, crash reports, or persisted debug snapshots.

### Pitfall 2: Cookie Session Without CSRF Protection

**What goes wrong:** Cross-site unsafe requests can reuse authenticated cookie session.
**Why it happens:** Session cookie is enabled but no origin/fetch-metadata checks exist.
**How to avoid:** Add CSRF middleware on unsafe methods and use `SameSite=Lax` or stricter where possible.
**Warning signs:** State-changing endpoint accepts requests with missing/foreign origin metadata.

### Pitfall 3: Overbroad Proxy Route Design

**What goes wrong:** Proxy forwards arbitrary third-party calls and becomes abuse vector.
**Why it happens:** Generic "forward anything" implementation to move fast.
**How to avoid:** Route allowlist (`/run`, `/status`, `/cancel`, `/retry`, `/purge-queue`) with per-route schema validation.
**Warning signs:** Endpoint accepts arbitrary URL/path from client.

### Pitfall 4: BYOK Persistence Ambiguity

**What goes wrong:** Users cannot tell when/where key is remembered; key is persisted unexpectedly.
**Why it happens:** UI copy and storage behavior are not explicit.
**How to avoid:** Default to non-persistent memory mode, explicit remember toggle, clear "stored on this browser" messaging, and one-click clear.
**Warning signs:** Key reappears after user expects it removed, or remains across sessions without consent.

### Pitfall 5: CORS Misconfiguration With Credentials

**What goes wrong:** Authenticated browser calls fail or become insecure.
**Why it happens:** Using wildcard origins with credentialed requests, or not matching deployment origin.
**How to avoid:** Explicit origin allowlist, `credentials: true` only when required, environment-specific origin config.
**Warning signs:** Browser CORS errors on auth endpoints or fallback to unsafe CORS settings.

## Code Examples

Verified patterns from official sources:

### Signed Cookie Session

```typescript
// Source: https://hono.dev/docs/helpers/cookie
import { setSignedCookie, getSignedCookie } from 'hono/cookie'

await setSignedCookie(c, 'session', 'invited', secret, {
  httpOnly: true,
  secure: true,
  sameSite: 'Lax',
  path: '/',
  prefix: 'host',
})

const session = await getSignedCookie(c, secret, 'session')
```

### CORS With Explicit Origin and Credentials

```typescript
// Source: https://hono.dev/docs/middleware/builtin/cors
import { cors } from 'hono/cors'

app.use('/api/*', cors({
  origin: 'https://app.example.com',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
}))
```

### CSRF Middleware on Unsafe Methods

```typescript
// Source: https://hono.dev/docs/middleware/builtin/csrf
import { csrf } from 'hono/csrf'

app.use('/api/*', csrf({ origin: 'https://app.example.com' }))
```

### Cryptographically Strong Token Material

```typescript
// Source: https://nodejs.org/api/crypto.html#cryptorandombytessize-callback
import { randomBytes, timingSafeEqual } from 'node:crypto'

const inviteToken = randomBytes(32).toString('hex')

function safeEquals(a: Buffer, b: Buffer) {
  return a.length === b.length && timingSafeEqual(a, b)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| Heavy server-owned auth + secret vault for early tools | Thin invited gate + BYOK with explicit browser-local choice | Common modern internal-tool architecture | Lower ops burden, lower long-term secret liability, faster delivery. |
| Manual security header/cookie implementations | Framework middleware (`secure-headers`, cookie helpers, csrf, cors) | Current framework best practice | Reduces subtle security bugs and maintenance overhead. |
| Unvalidated pass-through proxies | Schema-validated allowlist proxy endpoints | Current API security baseline | Tightens boundary and limits misuse/abuse paths. |

**Deprecated/outdated:**

- Generic open proxy endpoints for third-party APIs: replace with explicit lifecycle route allowlist.
- Silent key persistence behavior: replace with explicit remember semantics and clear UX copy.

## Open Questions

1. **Invite model granularity for v1**
   - What we know: Must support invited-user access, no public sign-up.
   - What's unclear: Single shared invite credential vs per-user invite tokens.
   - Recommendation: Plan for per-user or per-invite tokens if admin overhead is acceptable; otherwise start with a single rotating invite secret and document migration.

2. **"Remember key" UX policy depth**
   - What we know: AUTH-02 requires optional browser-local remember behavior.
   - What's unclear: Whether to expose both session-only and persistent modes, or only one remember mode.
   - Recommendation: Implement explicit `Remember on this device` (persistent) plus default memory mode in Phase 1; defer richer storage modes to later.

3. **Session duration and re-auth requirements**
   - What we know: Access should be invited-only with practical usability.
   - What's unclear: Required TTL and idle timeout policy for invited sessions.
   - Recommendation: Start with conservative fixed max-age (for example, 8-24h), then tune after UAT feedback.

## Sources

### Primary (HIGH confidence)

- https://docs.runpod.io/serverless/endpoints/send-requests - lifecycle endpoint behavior (`/run`, `/status`, `/cancel`, `/retry`, `/purge-queue`, `/runsync`)
- https://docs.runpod.io/api-reference/overview - API auth model (Bearer token)
- https://hono.dev/docs/helpers/cookie - signed cookies and cookie options/prefix handling
- https://hono.dev/docs/middleware/builtin/cors - CORS middleware options and credential/origin handling
- https://hono.dev/docs/middleware/builtin/csrf - CSRF middleware behavior and options
- https://hono.dev/docs/middleware/builtin/secure-headers - security header middleware
- https://zod.dev/v4 - Zod 4 schemas/strict parsing guidance
- https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage - browser-local persistence semantics
- https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage - tab/session-scoped persistence semantics
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie - cookie security attributes
- https://nodejs.org/api/crypto.html#cryptorandombytessize-callback - secure random generation
- https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b - constant-time comparison guidance

### Secondary (MEDIUM confidence)

- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html - operational session hardening guidance aligned with cookie/session recommendations

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - Directly verified via official docs for Node, Hono, Zod, Runpod, and MDN.
- Architecture: HIGH - Patterns are direct compositions of official middleware/API guidance and project constraints.
- Pitfalls: MEDIUM - Rooted in official guidance plus practical implementation risk patterns.

**Research date:** 2026-05-23
**Valid until:** 2026-06-22
