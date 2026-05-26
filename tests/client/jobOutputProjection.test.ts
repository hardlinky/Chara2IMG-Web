import { describe, expect, it } from "vitest";
import { projectJobOutputCluster, projectRecentJobOutputClusters } from "../../src/client/lib/jobOutputProjection";
import type { RecentJobRecord } from "../../src/shared/contracts/jobs";

const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5WvJwAAAAASUVORK5CYII=";
const tinyGifBase64 = "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

function createJob(overrides: Partial<RecentJobRecord>): RecentJobRecord {
  return {
    jobId: "job-1",
    endpointId: "endpoint-1",
    submittedAt: "2026-05-24T10:00:00.000Z",
    hiddenAt: null,
    lifecycle: {
      status: "COMPLETED",
      isTerminal: true,
      terminalReason: "completed",
      finishedAt: "2026-05-24T10:01:00.000Z"
    },
    provenance: {
      templateFingerprint: "fp-1",
      workflowFileName: "workflow-a.json",
      draftValues: {},
      submittedInput: {}
    },
    lastResponse: {
      output: {
        images: [{ image: tinyPngBase64 }, { image: `data:image/gif;base64,${tinyGifBase64}` }]
      }
    },
    lastError: null,
    ...overrides
  };
}

describe("jobOutputProjection", () => {
  it("projects multi-image completed jobs with representative and provenance", () => {
    const cluster = projectJobOutputCluster(createJob({}));

    expect(cluster).not.toBeNull();
    expect(cluster?.jobId).toBe("job-1");
    expect(cluster?.isPinned).toBe(false);
    expect(cluster?.outputCount).toBe(2);
    expect(cluster?.representative.outputIndex).toBe(0);
    expect(cluster?.workflowFileName).toBe("workflow-a.json");
  });

  it("omits non-output and non-completed jobs", () => {
    const failed = createJob({
      jobId: "job-failed",
      lifecycle: {
        status: "FAILED",
        isTerminal: true,
        terminalReason: "failed",
        finishedAt: "2026-05-24T10:01:00.000Z"
      }
    });

    const noImages = createJob({
      jobId: "job-empty",
      lastResponse: { output: { text: "no image" } }
    });

    const clusters = projectRecentJobOutputClusters([failed, noImages]);
    expect(clusters).toEqual([]);
  });

  it("orders clusters newest-first by completion/submission timestamp", () => {
    const older = createJob({
      jobId: "job-old",
      submittedAt: "2026-05-24T08:00:00.000Z",
      lifecycle: {
        status: "COMPLETED",
        isTerminal: true,
        terminalReason: "completed",
        finishedAt: "2026-05-24T08:02:00.000Z"
      }
    });

    const newer = createJob({
      jobId: "job-new",
      submittedAt: "2026-05-24T11:00:00.000Z",
      lifecycle: {
        status: "COMPLETED",
        isTerminal: true,
        terminalReason: "completed",
        finishedAt: "2026-05-24T11:03:00.000Z"
      }
    });

    const clusters = projectRecentJobOutputClusters([older, newer]);
    expect(clusters.map((cluster) => cluster.jobId)).toEqual(["job-new", "job-old"]);
  });

  it("filters out hidden output indices from projected cluster", () => {
    const job = createJob({ hiddenOutputIndices: [0] });
    const cluster = projectJobOutputCluster(job);

    expect(cluster).not.toBeNull();
    expect(cluster?.outputCount).toBe(1);
    expect(cluster?.outputs[0]?.outputIndex).toBe(1);
    expect(cluster?.representative.outputIndex).toBe(1);
  });

  it("returns null when all outputs are hidden via hiddenOutputIndices", () => {
    const job = createJob({ hiddenOutputIndices: [0, 1] });
    const cluster = projectJobOutputCluster(job);

    expect(cluster).toBeNull();
  });

  it("returns null when outputsHidden is true", () => {
    const job = createJob({ outputsHidden: true });
    const cluster = projectJobOutputCluster(job);

    expect(cluster).toBeNull();
  });

  it("passes through legacy jobs with missing workflow filename", () => {
    const legacy = createJob({
      jobId: "job-legacy",
      provenance: {
        templateFingerprint: "fp-legacy",
        draftValues: {},
        submittedInput: {}
      }
    });

    const cluster = projectJobOutputCluster(legacy);
    expect(cluster?.workflowFileName).toBeUndefined();
  });

  it("includes pinned state in projected cluster", () => {
    const pinned = createJob({ pinnedAt: "2026-05-24T10:04:00.000Z" });
    const cluster = projectJobOutputCluster(pinned);

    expect(cluster?.isPinned).toBe(true);
  });
});
