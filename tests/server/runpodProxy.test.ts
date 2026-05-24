import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { createServerApp } from "../../src/server/index";

function extractCookieHeader(setCookieHeader: string | null): string {
  if (!setCookieHeader) {
    return "";
  }

  return setCookieHeader.split(";")[0] ?? "";
}

describe("Runpod proxy boundary", () => {
  beforeEach(() => {
    process.env.INVITE_SECRET = "invite-test";
    process.env.COOKIE_SECRET = "cookie-secret-test";
    process.env.ALLOWED_ORIGIN = "http://localhost:5173";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true, forwarded: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        })
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards allowlisted run request with authorization header", async () => {
    const app = createServerApp();

    const inviteResponse = await app.request("http://localhost/api/access/verify-invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173"
      },
      body: JSON.stringify({ invite: "invite-test" })
    });

    const cookie = extractCookieHeader(inviteResponse.headers.get("set-cookie"));

    const proxyResponse = await app.request("http://localhost/api/runpod/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: "http://localhost:5173"
      },
      body: JSON.stringify({
        endpointId: "abc123",
        apiKey: "rp_test_key",
        input: {
          prompt: "hello"
        }
      })
    });

    expect(proxyResponse.status).toBe(200);

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain("https://api.runpod.ai/v2/abc123/run");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer rp_test_key");
  });

  it("forwards status request using path-based job URL", async () => {
    const app = createServerApp();

    const inviteResponse = await app.request("http://localhost/api/access/verify-invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173"
      },
      body: JSON.stringify({ invite: "invite-test" })
    });

    const cookie = extractCookieHeader(inviteResponse.headers.get("set-cookie"));

    const proxyResponse = await app.request("http://localhost/api/runpod/status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: "http://localhost:5173"
      },
      body: JSON.stringify({
        endpointId: "abc123",
        apiKey: "rp_test_key",
        id: "dda414c5-a1db-49f7-895a-31aac2a1c074-u1"
      })
    });

    expect(proxyResponse.status).toBe(200);

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain(
      "https://api.runpod.ai/v2/abc123/status/dda414c5-a1db-49f7-895a-31aac2a1c074-u1"
    );
    expect(init?.method).toBe("GET");
  });

  it("rejects malformed request payloads before forwarding", async () => {
    const app = createServerApp();

    const inviteResponse = await app.request("http://localhost/api/access/verify-invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173"
      },
      body: JSON.stringify({ invite: "invite-test" })
    });

    const cookie = extractCookieHeader(inviteResponse.headers.get("set-cookie"));

    const malformedResponse = await app.request("http://localhost/api/runpod/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: "http://localhost:5173"
      },
      body: JSON.stringify({
        endpointId: "abc123",
        apiKey: "rp_test_key",
        input: { prompt: "hello" },
        extra: "not-allowed"
      })
    });

    expect(malformedResponse.status).toBe(400);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("sanitizes key-like values in proxy error responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Bearer rp_live_secret_123");
      })
    );

    const app = createServerApp();

    const inviteResponse = await app.request("http://localhost/api/access/verify-invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173"
      },
      body: JSON.stringify({ invite: "invite-test" })
    });

    const cookie = extractCookieHeader(inviteResponse.headers.get("set-cookie"));

    const proxyResponse = await app.request("http://localhost/api/runpod/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: "http://localhost:5173"
      },
      body: JSON.stringify({
        endpointId: "abc123",
        apiKey: "rp_live_secret_123",
        input: {
          prompt: "hello"
        }
      })
    });

    const payload = await proxyResponse.text();

    expect(proxyResponse.status).toBe(502);
    expect(payload).not.toContain("rp_live_secret_123");
    expect(payload).toContain("REDACTED");
  });

  it("does not expose unsupported lifecycle routes", async () => {
    const app = createServerApp();

    const response = await app.request("http://localhost/api/runpod/unknown", {
      method: "POST"
    });

    expect(response.status).not.toBe(200);
  });
});
