import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildLifecycleSnapshotFromStatus, classifyKnownJob404Lifecycle, classifyTimeoutLifecycle } from "../../src/client/features/jobs/jobStatus";

describe("job polling", () => {
  it("does not classify a recently submitted IN_PROGRESS job as timed out", () => {
    const submittedAt = new Date().toISOString();
    const job = {
      jobId: "job-1",
      endpointId: "endpoint-1",
      submittedAt,
      hiddenAt: null as string | null,
      lifecycle: buildLifecycleSnapshotFromStatus("IN_PROGRESS", submittedAt),
      provenance: { templateFingerprint: "", draftValues: {}, submittedInput: {} },
      lastResponse: null,
      lastError: null
    };

    const result = classifyTimeoutLifecycle(job);
    expect(result).toBeNull();
  });

  it("classifies a 404 job as expired-or-not-found", () => {
    const submittedAt = new Date().toISOString();
    const job = {
      jobId: "job-404",
      endpointId: "endpoint-1",
      submittedAt,
      hiddenAt: null as string | null,
      lifecycle: buildLifecycleSnapshotFromStatus("IN_QUEUE", submittedAt),
      provenance: { templateFingerprint: "", draftValues: {}, submittedInput: {} },
      lastResponse: null,
      lastError: null
    };

    const lifecycle = classifyKnownJob404Lifecycle(job);
    expect(lifecycle.isTerminal).toBe(true);
    expect(lifecycle.terminalReason).toBe("expired-or-not-found");
  });

  it("builds correct IN_QUEUE lifecycle snapshot from status string", () => {
    const snapshot = buildLifecycleSnapshotFromStatus("IN_QUEUE");
    expect(snapshot.status).toBe("IN_QUEUE");
    expect(snapshot.isTerminal).toBe(false);
  });

  it("builds correct COMPLETED lifecycle snapshot from status string", () => {
    const finishedAt = "2026-06-01T12:00:00.000Z";
    const snapshot = buildLifecycleSnapshotFromStatus("COMPLETED", finishedAt);
    expect(snapshot.status).toBe("COMPLETED");
    expect(snapshot.isTerminal).toBe(true);
    expect(snapshot.terminalReason).toBe("completed");
  });

  it("normalizes vendor aliases to canonical Runpod statuses", () => {
    expect(buildLifecycleSnapshotFromStatus("queued").status).toBe("IN_QUEUE");
    expect(buildLifecycleSnapshotFromStatus("running").status).toBe("IN_PROGRESS");
    expect(buildLifecycleSnapshotFromStatus("PROCESSING").status).toBe("IN_PROGRESS");
  });
});
