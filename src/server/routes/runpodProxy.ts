import type { Hono } from "hono";
import { requireInvitedSession } from "../middleware/session";
import { cancelRequestSchema, purgeQueueRequestSchema, retryRequestSchema, runRequestSchema, statusBatchRequestSchema, statusRequestSchema } from "../schemas/runpodProxy";
import { forwardRunpodRequest } from "../lib/runpodClient";
import { pollRunpodJobNow, trackRunpodJob } from "../lib/runpodJobTracker";
import { redactSecrets } from "../lib/redaction";
import { getCachedRunpodJobState, setCachedRunpodJobState } from "../lib/runpodJobStateStore";

function resolveRunpodApiKey(requestApiKey: string): string {
  const serverApiKey = process.env.RUNPOD_API_KEY?.trim();
  if (serverApiKey) {
    return serverApiKey;
  }

  return requestApiKey;
}

function toProxyResponse(response: Response, body: string): Response {
  return new Response(body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/json"
    }
  });
}

function toSafeProxyError(error: unknown): { ok: false; error: string; details: unknown } {
  return {
    ok: false,
    error: "Runpod request failed",
    details: redactSecrets({ message: error instanceof Error ? error.message : String(error) })
  };
}

export function registerRunpodProxyRoutes(app: Hono): void {
  app.use("/api/runpod/*", requireInvitedSession);

  app.post("/api/runpod/run", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const parsed = runRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json({ ok: false, error: "Invalid run request" }, 400);
    }

    try {
      const response = await forwardRunpodRequest({
        endpointId: parsed.data.endpointId,
        apiKey: resolveRunpodApiKey(parsed.data.apiKey),
        operation: "run",
        body: { input: parsed.data.input }
      });

      const body = await response.text();
      if (response.ok) {
        try {
          const parsedBody = JSON.parse(body) as { id?: unknown; jobId?: unknown };
          const jobId = typeof parsedBody.id === "string" ? parsedBody.id : typeof parsedBody.jobId === "string" ? parsedBody.jobId : null;

          if (jobId) {
            const resolvedApiKey = resolveRunpodApiKey(parsed.data.apiKey);
            setCachedRunpodJobState(parsed.data.endpointId, jobId, parsedBody);
            trackRunpodJob(parsed.data.endpointId, jobId, resolvedApiKey);
          }
        } catch {
          // Ignore non-JSON run responses for cache tracking.
        }
      }

      return toProxyResponse(response, body);
    } catch (error) {
      return c.json(toSafeProxyError(error), 502);
    }
  });

  app.post("/api/runpod/status", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const parsed = statusRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json({ ok: false, error: "Invalid status request" }, 400);
    }

    try {
      const resolvedApiKey = resolveRunpodApiKey(parsed.data.apiKey);
      const cached = getCachedRunpodJobState(parsed.data.endpointId, parsed.data.id);
      if (cached) {
        if (cached.isTerminal) {
          return c.json(cached.data);
        }
      }

      const polled = await pollRunpodJobNow(parsed.data.endpointId, parsed.data.id, resolvedApiKey);
      if (polled.ok) {
        return c.json(polled.data);
      }

      return c.json(
        {
          ok: false,
          error: polled.error,
          data: polled.data ?? null
        },
        502
      );
    } catch (error) {
      return c.json(toSafeProxyError(error), 502);
    }
  });

  app.post("/api/runpod/status-batch", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const parsed = statusBatchRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json({ ok: false, error: "Invalid status-batch request" }, 400);
    }

    const items = await Promise.all(
      parsed.data.ids.map(async (id) => {
        try {
          const resolvedApiKey = resolveRunpodApiKey(parsed.data.apiKey);
          const cached = getCachedRunpodJobState(parsed.data.endpointId, id);
          if (cached?.isTerminal) {
            return {
              id,
              ok: true,
              statusCode: 200,
              data: cached.data,
              source: "cache"
            };
          }

          const polled = await pollRunpodJobNow(parsed.data.endpointId, id, resolvedApiKey);

          if (!polled.ok) {
            return {
              id,
              ok: false,
              statusCode: polled.statusCode,
              error: polled.error,
              data: polled.data ?? null
            };
          }

          return {
            id,
            ok: true,
            statusCode: polled.statusCode,
            data: polled.data,
            source: "tracker"
          };
        } catch (error) {
          return {
            id,
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      })
    );

    return c.json({ items });
  });

  app.post("/api/runpod/cancel", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const parsed = cancelRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json({ ok: false, error: "Invalid cancel request" }, 400);
    }

    try {
      const response = await forwardRunpodRequest({
        endpointId: parsed.data.endpointId,
        apiKey: resolveRunpodApiKey(parsed.data.apiKey),
        operation: "cancel",
        id: parsed.data.id
      });

      const body = await response.text();
      if (response.ok) {
        try {
          setCachedRunpodJobState(parsed.data.endpointId, parsed.data.id, JSON.parse(body));
        } catch {
          // Ignore non-JSON cancel payloads for cache tracking.
        }
      }

      return toProxyResponse(response, body);
    } catch (error) {
      return c.json(toSafeProxyError(error), 502);
    }
  });

  app.post("/api/runpod/retry", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const parsed = retryRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json({ ok: false, error: "Invalid retry request" }, 400);
    }

    try {
      const response = await forwardRunpodRequest({
        endpointId: parsed.data.endpointId,
        apiKey: resolveRunpodApiKey(parsed.data.apiKey),
        operation: "retry",
        id: parsed.data.id
      });

      const body = await response.text();
      if (response.ok) {
        try {
          setCachedRunpodJobState(parsed.data.endpointId, parsed.data.id, JSON.parse(body));
          trackRunpodJob(parsed.data.endpointId, parsed.data.id, resolveRunpodApiKey(parsed.data.apiKey));
        } catch {
          // Ignore non-JSON retry payloads for cache tracking.
        }
      }

      return toProxyResponse(response, body);
    } catch (error) {
      return c.json(toSafeProxyError(error), 502);
    }
  });

  app.post("/api/runpod/purge-queue", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const parsed = purgeQueueRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json({ ok: false, error: "Invalid purge-queue request" }, 400);
    }

    try {
      const response = await forwardRunpodRequest({
        endpointId: parsed.data.endpointId,
        apiKey: resolveRunpodApiKey(parsed.data.apiKey),
        operation: "purge-queue",
        body: {}
      });

      return toProxyResponse(response, await response.text());
    } catch (error) {
      return c.json(toSafeProxyError(error), 502);
    }
  });
}
