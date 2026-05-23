import type { Hono } from "hono";
import { requireInvitedSession } from "../middleware/session";
import { cancelRequestSchema, purgeQueueRequestSchema, retryRequestSchema, runRequestSchema, statusRequestSchema } from "../schemas/runpodProxy";
import { forwardRunpodRequest } from "../lib/runpodClient";

function toProxyResponse(response: Response, body: string): Response {
  return new Response(body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/json"
    }
  });
}

export function registerRunpodProxyRoutes(app: Hono): void {
  app.use("/api/runpod/*", requireInvitedSession);

  app.post("/api/runpod/run", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const parsed = runRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json({ ok: false, error: "Invalid run request" }, 400);
    }

    const response = await forwardRunpodRequest({
      endpointId: parsed.data.endpointId,
      apiKey: parsed.data.apiKey,
      operation: "run",
      body: { input: parsed.data.input }
    });

    return toProxyResponse(response, await response.text());
  });

  app.post("/api/runpod/status", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const parsed = statusRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json({ ok: false, error: "Invalid status request" }, 400);
    }

    const response = await forwardRunpodRequest({
      endpointId: parsed.data.endpointId,
      apiKey: parsed.data.apiKey,
      operation: "status",
      body: { id: parsed.data.id }
    });

    return toProxyResponse(response, await response.text());
  });

  app.post("/api/runpod/cancel", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const parsed = cancelRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json({ ok: false, error: "Invalid cancel request" }, 400);
    }

    const response = await forwardRunpodRequest({
      endpointId: parsed.data.endpointId,
      apiKey: parsed.data.apiKey,
      operation: "cancel",
      body: { id: parsed.data.id }
    });

    return toProxyResponse(response, await response.text());
  });

  app.post("/api/runpod/retry", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const parsed = retryRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json({ ok: false, error: "Invalid retry request" }, 400);
    }

    const response = await forwardRunpodRequest({
      endpointId: parsed.data.endpointId,
      apiKey: parsed.data.apiKey,
      operation: "retry",
      body: { id: parsed.data.id }
    });

    return toProxyResponse(response, await response.text());
  });

  app.post("/api/runpod/purge-queue", async (c) => {
    const payload = await c.req.json().catch(() => null);
    const parsed = purgeQueueRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json({ ok: false, error: "Invalid purge-queue request" }, 400);
    }

    const response = await forwardRunpodRequest({
      endpointId: parsed.data.endpointId,
      apiKey: parsed.data.apiKey,
      operation: "purge-queue",
      body: {}
    });

    return toProxyResponse(response, await response.text());
  });
}
