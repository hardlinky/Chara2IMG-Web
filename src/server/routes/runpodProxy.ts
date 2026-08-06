import type { Hono } from "hono";
import { getSessionUser, requireInvitedSession } from "../middleware/session";
import { cancelRequestSchema, purgeQueueRequestSchema, retryRequestSchema, runRequestSchema, statusBatchRequestSchema, statusRequestSchema } from "../schemas/runpodProxy";
import { forwardRunpodRequest } from "../lib/runpodClient";
import { trackJob, pollJobNow } from "../lib/jobTracker";
import { createJob, readJob, updateJob } from "../lib/jobStore";
import { redactSecrets } from "../lib/redaction";
import { isTerminalRunpodStatus, normalizeRunpodStatus, toTerminalReason, type JobStatus } from "../../shared/contracts/jobs";
import { formatJobDisplayName } from "../../shared/jobDisplay";
import { logServerError, logServerWarning } from "../lib/logger";

function resolveRunpodApiKey(requestApiKey: string): string {
  // Dedicated name avoids RunPod's auto-injected pod-scoped RUNPOD_API_KEY.
  const serverApiKey = process.env.SERVER_RUNPOD_API_KEY?.trim();
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

function toSafeProxyError(error: unknown, context: string, metadata?: Record<string, unknown>): { ok: false; error: string; details: unknown } {
  logServerError(context, error, metadata);

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
            const meta = parsed.data.meta;
            const now = new Date().toISOString();
            const createdBy = await getSessionUser(c);
            void createJob(
              {
                jobId,
                displayName: formatJobDisplayName(jobId),
                endpointId: parsed.data.endpointId,
                workflowFileName: meta?.workflowFileName ?? null,
                submittedAt: now,
                startedAt: null,
                completedAt: null,
                expiresAt: null,
                status: "IN_QUEUE" as JobStatus,
                isTerminal: false,
                imageCount: 0,
                lastError: null,
                createdBy,
              },
              {
                draftValues: (meta?.draftValues ?? {}) as import("../../shared/contracts/inputs").DynamicInputDraftValues,
                submittedInput: parsed.data.input,
              },
            ).then(() => trackJob(parsed.data.endpointId, jobId, resolvedApiKey)).catch((err: unknown) => {
              logServerWarning("Failed to persist initial job record", err, { jobId });
              void trackJob(parsed.data.endpointId, jobId, resolvedApiKey);
            });
          }
        } catch (error) {
          logServerWarning("Runpod run response was not JSON", error, {
            endpointId: parsed.data.endpointId
          });
        }
      }

      return toProxyResponse(response, body);
    } catch (error) {
      return c.json(toSafeProxyError(error, "Runpod run proxy failed", {
        endpointId: parsed.data.endpointId
      }), 502);
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
      const cached = await readJob(parsed.data.id);
      if (cached?.isTerminal) {
        return c.json(cached);
      }

      const polled = await pollJobNow(parsed.data.endpointId, parsed.data.id, resolvedApiKey);
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
      return c.json(toSafeProxyError(error, "Runpod status proxy failed", {
        endpointId: parsed.data.endpointId,
        jobId: parsed.data.id
      }), 502);
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
          const cached = await readJob(id);
          if (cached?.isTerminal) {
            return {
              id,
              ok: true,
              statusCode: 200,
              data: cached,
              source: "cache"
            };
          }

          const polled = await pollJobNow(parsed.data.endpointId, id, resolvedApiKey);

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
            source: "runpod"
          };
        } catch (error) {
          logServerError("Runpod status-batch item failed", error, {
            endpointId: parsed.data.endpointId,
            jobId: id
          });

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
          const normalized = normalizeRunpodStatus((JSON.parse(body) as { status?: string })?.status ?? "CANCELLED");
          await updateJob(parsed.data.id, {
            status: normalized as JobStatus,
            isTerminal: isTerminalRunpodStatus(normalized),
            terminalReason: toTerminalReason(normalized)
          });
        } catch (error) {
          logServerWarning("Runpod cancel response was not JSON", error, {
            endpointId: parsed.data.endpointId,
            jobId: parsed.data.id
          });
        }
      }

      return toProxyResponse(response, body);
    } catch (error) {
      return c.json(toSafeProxyError(error, "Runpod cancel proxy failed", {
        endpointId: parsed.data.endpointId,
        jobId: parsed.data.id
      }), 502);
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
        void trackJob(parsed.data.endpointId, parsed.data.id, resolveRunpodApiKey(parsed.data.apiKey));
      }

      return toProxyResponse(response, body);
    } catch (error) {
      return c.json(toSafeProxyError(error, "Runpod retry proxy failed", {
        endpointId: parsed.data.endpointId,
        jobId: parsed.data.id
      }), 502);
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
      return c.json(toSafeProxyError(error, "Runpod purge-queue proxy failed", {
        endpointId: parsed.data.endpointId
      }), 502);
    }
  });
}
