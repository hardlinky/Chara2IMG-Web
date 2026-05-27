import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { RecentJobRecord } from "../../src/shared/contracts/jobs";
import { RecentJobsPanel } from "../../src/client/features/jobs/RecentJobsPanel";

function createJob(overrides: Partial<RecentJobRecord>): RecentJobRecord {
  return {
    jobId: "job-1",
    endpointId: "endpoint-1",
    submittedAt: "2026-05-23T10:00:00.000Z",
    hiddenAt: null,
    lifecycle: {
      status: "FAILED",
      isTerminal: true,
      terminalReason: "failed",
      finishedAt: "2026-05-23T10:10:00.000Z",
      lastCheckedAt: "2026-05-23T10:10:00.000Z",
      warning: null,
      executionTimeMs: 600000,
      failureReason: "Queue exceeded limits"
    },
    provenance: {
      templateFingerprint: "fp-1",
      draftValues: {},
      submittedInput: {}
    },
    lastResponse: null,
    lastError: null,
    ...overrides
  };
}

describe("RecentJobsPanel", () => {
  it("renders the required compact list controls and row content", () => {
    const html = renderToStaticMarkup(
      <RecentJobsPanel
        jobs={[createJob({ jobId: "job-123" })]}
        warningJobIds={[]}
        cancelingJobIds={[]}
        statusFilter="All"
        page={1}
        pageCount={3}
        pageNumbers={[1, 2, 3]}
        onStatusFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onRerun={vi.fn()}
        onPollStatus={vi.fn()}
        onLoadInputs={vi.fn()}
        onExportWorkflow={vi.fn()}
        onRemoveVisible={vi.fn()}
        formatSubmittedAtRelative={() => "2h ago"}
      />
    );

    expect(html).toContain("Recent Jobs");
    expect(html).toContain("job-123");
    expect(html).toContain("Status: FAILED");
    expect(html).toContain("2h ago");
    expect(html).toContain("Queue exceeded limits");
    expect(html).toContain("Execution time: 600s");
    expect(html).toContain("Prev");
    expect(html).toContain("Next");
    expect(html).toContain("Load Inputs");
    expect(html).not.toContain("Export");
    expect(html).not.toContain("Restore");
  });

  it("prints the returned error message for failed jobs", () => {
    const html = renderToStaticMarkup(
      <RecentJobsPanel
        jobs={[
          createJob({
            jobId: "job-error",
            lastError: "Proxy request failed (500) Upstream timed out",
            lifecycle: {
              status: "FAILED",
              isTerminal: true,
              terminalReason: "failed",
              finishedAt: "2026-05-23T10:10:00.000Z",
              lastCheckedAt: "2026-05-23T10:10:00.000Z",
              warning: null,
              executionTimeMs: 600000,
              failureReason: "Queue exceeded limits"
            }
          })
        ]}
        warningJobIds={[]}
        cancelingJobIds={[]}
        statusFilter="All"
        page={1}
        pageCount={1}
        pageNumbers={[1]}
        onStatusFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onRerun={vi.fn()}
        onPollStatus={vi.fn()}
        onLoadInputs={vi.fn()}
        onExportWorkflow={vi.fn()}
        onRemoveVisible={vi.fn()}
        formatSubmittedAtRelative={() => "just now"}
      />
    );

    expect(html).toContain("Error:");
    expect(html).toContain("Proxy request failed (500) Upstream timed out");
    expect(html).not.toContain("Queue exceeded limits");
  });

  it("prints the worker id when the job response includes one", () => {
    const html = renderToStaticMarkup(
      <RecentJobsPanel
        jobs={[
          createJob({
            jobId: "job-worker",
            lastResponse: {
              workerId: "worker-42"
            }
          })
        ]}
        warningJobIds={[]}
        cancelingJobIds={[]}
        statusFilter="All"
        page={1}
        pageCount={1}
        pageNumbers={[1]}
        onStatusFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onRerun={vi.fn()}
        onPollStatus={vi.fn()}
        onLoadInputs={vi.fn()}
        onExportWorkflow={vi.fn()}
        onRemoveVisible={vi.fn()}
        formatSubmittedAtRelative={() => "just now"}
      />
    );

    expect(html).toContain("Worker ID: worker-42");
  });

  it("shows Export only on completed jobs", () => {
    const html = renderToStaticMarkup(
      <RecentJobsPanel
        jobs={[
          createJob({
            jobId: "job-completed",
            lifecycle: {
              status: "COMPLETED",
              isTerminal: true,
              terminalReason: "completed",
              finishedAt: "2026-05-23T10:10:00.000Z",
              lastCheckedAt: "2026-05-23T10:10:00.000Z",
              warning: null,
              executionTimeMs: 600000,
              failureReason: null
            }
          })
        ]}
        warningJobIds={[]}
        cancelingJobIds={[]}
        statusFilter="All"
        page={1}
        pageCount={1}
        pageNumbers={[1]}
        onStatusFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onRerun={vi.fn()}
        onPollStatus={vi.fn()}
        onLoadInputs={vi.fn()}
        onExportWorkflow={vi.fn()}
        onRemoveVisible={vi.fn()}
        formatSubmittedAtRelative={() => "just now"}
      />
    );

    expect(html).toContain("Export");
  });

  it("renders the exact empty state text when there are no visible jobs", () => {
    const html = renderToStaticMarkup(
      <RecentJobsPanel
        jobs={[]}
        warningJobIds={[]}
        cancelingJobIds={[]}
        statusFilter="All"
        page={1}
        pageCount={1}
        pageNumbers={[1]}
        onStatusFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onRerun={vi.fn()}
        onPollStatus={vi.fn()}
        onLoadInputs={vi.fn()}
        onExportWorkflow={vi.fn()}
        onRemoveVisible={vi.fn()}
        formatSubmittedAtRelative={() => "just now"}
      />
    );

    expect(html).toContain("No recent jobs yet");
  });

  it("shows refresh icon button for transient jobs and hides it for terminal jobs", () => {
    const inProgressHtml = renderToStaticMarkup(
      <RecentJobsPanel
        jobs={[
          createJob({
            jobId: "job-in-progress",
            lifecycle: {
              status: "IN_PROGRESS",
              isTerminal: false,
              terminalReason: undefined,
              lastCheckedAt: "2026-05-23T10:05:00.000Z",
              warning: null,
              executionTimeMs: undefined,
              failureReason: null
            }
          })
        ]}
        warningJobIds={[]}
        cancelingJobIds={[]}
        statusFilter="All"
        page={1}
        pageCount={1}
        pageNumbers={[1]}
        onStatusFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onRerun={vi.fn()}
        onPollStatus={vi.fn()}
        onLoadInputs={vi.fn()}
        onExportWorkflow={vi.fn()}
        onRemoveVisible={vi.fn()}
        formatSubmittedAtRelative={() => "just now"}
      />
    );

    expect(inProgressHtml).toContain('aria-label="Refresh job status"');

    const inQueueHtml = renderToStaticMarkup(
      <RecentJobsPanel
        jobs={[
          createJob({
            jobId: "job-in-queue",
            lifecycle: {
              status: "IN_QUEUE",
              isTerminal: false,
              terminalReason: undefined,
              lastCheckedAt: "2026-05-23T10:05:00.000Z",
              warning: null,
              executionTimeMs: undefined,
              failureReason: null
            }
          })
        ]}
        warningJobIds={[]}
        cancelingJobIds={[]}
        statusFilter="All"
        page={1}
        pageCount={1}
        pageNumbers={[1]}
        onStatusFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onRerun={vi.fn()}
        onPollStatus={vi.fn()}
        onLoadInputs={vi.fn()}
        onExportWorkflow={vi.fn()}
        onRemoveVisible={vi.fn()}
        formatSubmittedAtRelative={() => "just now"}
      />
    );

    expect(inQueueHtml).toContain('aria-label="Refresh job status"');

    const cancellingHtml = renderToStaticMarkup(
      <RecentJobsPanel
        jobs={[
          createJob({
            jobId: "job-cancelling",
            lifecycle: {
              status: "CANCELLING",
              isTerminal: false,
              terminalReason: undefined,
              lastCheckedAt: "2026-05-23T10:05:00.000Z",
              warning: null,
              executionTimeMs: undefined,
              failureReason: null
            }
          })
        ]}
        warningJobIds={[]}
        cancelingJobIds={[]}
        statusFilter="All"
        page={1}
        pageCount={1}
        pageNumbers={[1]}
        onStatusFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onRerun={vi.fn()}
        onPollStatus={vi.fn()}
        onLoadInputs={vi.fn()}
        onExportWorkflow={vi.fn()}
        onRemoveVisible={vi.fn()}
        formatSubmittedAtRelative={() => "just now"}
      />
    );

    expect(cancellingHtml).toContain('aria-label="Refresh job status"');

    const failedHtml = renderToStaticMarkup(
      <RecentJobsPanel
        jobs={[createJob({ jobId: "job-failed" })]}
        warningJobIds={[]}
        cancelingJobIds={[]}
        statusFilter="All"
        page={1}
        pageCount={1}
        pageNumbers={[1]}
        onStatusFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onRerun={vi.fn()}
        onPollStatus={vi.fn()}
        onLoadInputs={vi.fn()}
        onExportWorkflow={vi.fn()}
        onRemoveVisible={vi.fn()}
        formatSubmittedAtRelative={() => "just now"}
      />
    );

    expect(failedHtml).not.toContain("Refresh job status");
  });
});
