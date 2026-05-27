import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { createServerApp } from "../../src/server/index";
import { clearRunpodJobStateStore } from "../../src/server/lib/runpodJobStateStore";

function extractCookieHeader(setCookieHeader: string | null): string {
  if (!setCookieHeader) {
    return "";
  }

  return setCookieHeader.split(";")[0] ?? "";
}

describe("Runpod proxy boundary", () => {
  beforeEach(() => {
    clearRunpodJobStateStore();
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

  it("serves cached terminal status in status-batch without refetching runpod", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "job-terminal", status: "COMPLETED", output: { images: [{ image: "abc" }] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
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

    const firstResponse = await app.request("http://localhost/api/runpod/status-batch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: "http://localhost:5173"
      },
      body: JSON.stringify({
        endpointId: "abc123",
        apiKey: "rp_test_key",
        ids: ["job-terminal"]
      })
    });

    expect(firstResponse.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();

    const secondResponse = await app.request("http://localhost/api/runpod/status-batch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: "http://localhost:5173"
      },
      body: JSON.stringify({
        endpointId: "abc123",
        apiKey: "rp_test_key",
        ids: ["job-terminal"]
      })
    });

    const secondPayload = (await secondResponse.json()) as {
      items: Array<{ id: string; ok: boolean; source?: string; data?: { status?: string } }>;
    };

    expect(fetchMock).not.toHaveBeenCalled();
    expect(secondPayload.items[0]?.id).toBe("job-terminal");
    expect(secondPayload.items[0]?.ok).toBe(true);
    expect(secondPayload.items[0]?.source).toBe("cache");
    expect(secondPayload.items[0]?.data?.status).toBe("COMPLETED");
  });

  it("prunes cached backend states not present in knownIds during status-batch", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "job-a", status: "COMPLETED" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "job-b", status: "COMPLETED" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "job-b", status: "IN_PROGRESS" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
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

    const primeResponse = await app.request("http://localhost/api/runpod/status-batch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: "http://localhost:5173"
      },
      body: JSON.stringify({
        endpointId: "abc123",
        apiKey: "rp_test_key",
        ids: ["job-a", "job-b"],
        knownIds: ["job-a", "job-b"]
      })
    });

    expect(primeResponse.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockClear();

    const pruneResponse = await app.request("http://localhost/api/runpod/status-batch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: "http://localhost:5173"
      },
      body: JSON.stringify({
        endpointId: "abc123",
        apiKey: "rp_test_key",
        ids: ["job-a"],
        knownIds: ["job-a"]
      })
    });

    expect(pruneResponse.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();

    const postPruneResponse = await app.request("http://localhost/api/runpod/status-batch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: "http://localhost:5173"
      },
      body: JSON.stringify({
        endpointId: "abc123",
        apiKey: "rp_test_key",
        ids: ["job-b"]
      })
    });

    const postPrunePayload = (await postPruneResponse.json()) as {
      items: Array<{ id: string; ok: boolean; source?: string; data?: { status?: string } }>;
    };

    expect(postPruneResponse.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(postPrunePayload.items[0]?.id).toBe("job-b");
    expect(postPrunePayload.items[0]?.source).toBe("runpod");
    expect(postPrunePayload.items[0]?.data?.status).toBe("IN_PROGRESS");
  });
});
