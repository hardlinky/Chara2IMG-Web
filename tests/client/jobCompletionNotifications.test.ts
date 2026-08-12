import { describe, expect, it } from "vitest";
import { getNewlyCompletedJobsForNotification } from "../../src/client/App";

describe("job completion notifications", () => {
  it("ignores historical terminal jobs on first load", () => {
    const jobs = [
      {
        jobId: "old-1",
        lifecycle: { status: "COMPLETED", isTerminal: true },
        availableImageIndices: [0],
        outputImageCount: 1,
      },
      {
        jobId: "old-2",
        lifecycle: { status: "FAILED", isTerminal: true },
        outputImageCount: 0,
      },
    ];

    expect(getNewlyCompletedJobsForNotification(jobs, new Set())).toEqual([]);
  });

  it("notifies only newly terminal jobs after startup", () => {
    const jobs = [
      {
        jobId: "old-1",
        lifecycle: { status: "COMPLETED", isTerminal: true },
        availableImageIndices: [0],
        outputImageCount: 1,
      },
      {
        jobId: "new-1",
        lifecycle: { status: "COMPLETED", isTerminal: true },
        availableImageIndices: [0],
        outputImageCount: 1,
      },
    ];

    expect(getNewlyCompletedJobsForNotification(jobs, new Set(["old-1"]))).toEqual([
      jobs[1],
    ]);
  });
});
