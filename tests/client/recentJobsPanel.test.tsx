import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { RecentJobRecord } from "../../src/shared/contracts/jobs";
import { formatOutputJobId } from "../../src/client/features/outputs/formatOutputJobId";
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
      workflowFileName: "workflow-default.json",
      draftValues: {},
      submittedInput: {}
    },
    lastResponse: null,
    lastError: null,
    ...overrides
  };
}

describe("RecentJobsPanel", () => {
  it("shows only the finalized price number in green", () => {
    const html = renderToStaticMarkup(
      <RecentJobsPanel
        jobs={[createJob({
          billingMode: "managed",
          creditsCharged: 6,
          refreshingCreditsCharged: 4,
          staticCreditsCharged: 2
        })]}
        warningJobIds={[]}
        cancelingJobIds={[]}
        statusFilter="All"
        ownerFilter="all"
        currentUser={null}
        onOwnerFilterChange={vi.fn()}
        page={1}
        pageCount={1}
        pageNumbers={[1]}
        onStatusFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onRerun={vi.fn()}
        onLoadInputs={vi.fn()}
        onExportWorkflow={vi.fn()}
        onRemoveVisible={vi.fn()}
        formatSubmittedAtRelative={() => "just now"}
        lastFetchedAt={null}
      />
    );

    expect(html).toContain('class="jobs-price jobs-price-refreshing"');
    expect(html).toContain('aria-label="Refreshing credits charged: 4"');
    expect(html).toContain(">4</span>");
    expect(html).toContain('class="jobs-price jobs-price-static"');
    expect(html).toContain('aria-label="Static credits charged: 2"');
    expect(html).toContain(">2</span>");
    expect(html).not.toContain("Price:");
  });

  it("renders the required compact list controls and row content", () => {
    const displayJobId = formatOutputJobId("job-123");
    const html = renderToStaticMarkup(
      <RecentJobsPanel
        jobs={[createJob({ jobId: "job-123" })]}
        warningJobIds={[]}
        cancelingJobIds={[]}
        statusFilter="All"
        ownerFilter="all"
        currentUser={null}
        onOwnerFilterChange={vi.fn()}
        page={1}
        pageCount={3}
        pageNumbers={[1, 2, 3]}
        onStatusFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onRerun={vi.fn()}
        onLoadInputs={vi.fn()}
        onExportWorkflow={vi.fn()}
        onRemoveVisible={vi.fn()}
        formatSubmittedAtRelative={() => "2h ago"}
        lastFetchedAt={null}
      />
    );

    expect(html).toContain("Recent Jobs");
  expect(html).toContain(displayJobId);
    expect(html).toContain("Workflow: workflow-default.json");
    expect(html).toContain(">FAILED<");
    expect(html).toContain("2h ago (10m 0s)");
    expect(html).toContain("Queue exceeded limits");
    expect(html).not.toContain("Execution time: 0h 10m 0s");
    expect(html).toContain("Prev");
    expect(html).toContain("Next");
    expect(html).toContain(`Load inputs from ${displayJobId}`);
    expect(html).not.toContain(`Export workflow for ${displayJobId}`);
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
        ownerFilter="all"
        currentUser={null}
        onOwnerFilterChange={vi.fn()}
        page={1}
        pageCount={1}
        pageNumbers={[1]}
        onStatusFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onRerun={vi.fn()}

        onLoadInputs={vi.fn()}
        onExportWorkflow={vi.fn()}
        onRemoveVisible={vi.fn()}
        formatSubmittedAtRelative={() => "just now"}
        lastFetchedAt={null}
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
        ownerFilter="all"
        currentUser={null}
        onOwnerFilterChange={vi.fn()}
        page={1}
        pageCount={1}
        pageNumbers={[1]}
        onStatusFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onRerun={vi.fn()}

        onLoadInputs={vi.fn()}
        onExportWorkflow={vi.fn()}
        onRemoveVisible={vi.fn()}
        formatSubmittedAtRelative={() => "just now"}
        lastFetchedAt={null}
      />
    );

    expect(html).toContain("Worker: worker-42");
  });

  it("shows completed-job actions and disables output navigation when no outputs remain", () => {
    const displayJobId = formatOutputJobId("job-completed");
    const html = renderToStaticMarkup(
      <RecentJobsPanel
        jobs={[
          createJob({
            jobId: "job-completed",
            outputImageCount: 0,
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
        ownerFilter="all"
        currentUser={null}
        onOwnerFilterChange={vi.fn()}
        page={1}
        pageCount={1}
        pageNumbers={[1]}
        onStatusFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onRerun={vi.fn()}

        onLoadInputs={vi.fn()}
        onExportWorkflow={vi.fn()}
        onViewOutputs={vi.fn()}
        onRemoveVisible={vi.fn()}
        formatSubmittedAtRelative={() => "just now"}
        lastFetchedAt={null}
      />
    );

    expect(html).toContain(`Export workflow for ${displayJobId}`);
    expect(html).toContain(`aria-label="No outputs available for ${displayJobId}"`);
    expect(html).toContain("disabled");
  });

  it("enables output navigation when a completed job has outputs", () => {
    const displayJobId = formatOutputJobId("job-with-outputs");
    const html = renderToStaticMarkup(
      <RecentJobsPanel
        jobs={[
          createJob({
            jobId: "job-with-outputs",
            outputImageCount: 1,
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
        ownerFilter="all"
        currentUser={null}
        onOwnerFilterChange={vi.fn()}
        page={1}
        pageCount={1}
        pageNumbers={[1]}
        onStatusFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onRerun={vi.fn()}
        onLoadInputs={vi.fn()}
        onExportWorkflow={vi.fn()}
        onViewOutputs={vi.fn()}
        onRemoveVisible={vi.fn()}
        formatSubmittedAtRelative={() => "just now"}
        lastFetchedAt={null}
      />
    );

    expect(html).toContain(`aria-label="View outputs for ${displayJobId}"`);
    expect(html).not.toContain(`aria-label="View outputs for ${displayJobId}" disabled`);
  });

  it("renders the exact empty state text when there are no visible jobs", () => {
    const html = renderToStaticMarkup(
      <RecentJobsPanel
        jobs={[]}
        warningJobIds={[]}
        cancelingJobIds={[]}
        statusFilter="All"
        ownerFilter="all"
        currentUser={null}
        onOwnerFilterChange={vi.fn()}
        page={1}
        pageCount={1}
        pageNumbers={[1]}
        onStatusFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onRerun={vi.fn()}

        onLoadInputs={vi.fn()}
        onExportWorkflow={vi.fn()}
        onRemoveVisible={vi.fn()}
        formatSubmittedAtRelative={() => "just now"}
        lastFetchedAt={null}
      />
    );

    expect(html).toContain("No recent jobs yet");
  });

  it("shows next-poll countdown for transient jobs and hides it for terminal jobs", () => {
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
        ownerFilter="all"
        currentUser={null}
        onOwnerFilterChange={vi.fn()}
        page={1}
        pageCount={1}
        pageNumbers={[1]}
        onStatusFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onRerun={vi.fn()}

        onLoadInputs={vi.fn()}
        onExportWorkflow={vi.fn()}
        onRemoveVisible={vi.fn()}
        formatSubmittedAtRelative={() => "just now"}
        lastFetchedAt={null}
      />
    );

    expect(inProgressHtml).toContain("Next poll in");
    expect(inProgressHtml).toContain("Execution time:");

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
        ownerFilter="all"
        currentUser={null}
        onOwnerFilterChange={vi.fn()}
        page={1}
        pageCount={1}
        pageNumbers={[1]}
        onStatusFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onRerun={vi.fn()}

        onLoadInputs={vi.fn()}
        onExportWorkflow={vi.fn()}
        onRemoveVisible={vi.fn()}
        formatSubmittedAtRelative={() => "just now"}
        lastFetchedAt={null}
      />
    );

    expect(inQueueHtml).toContain("Next poll in");

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
        ownerFilter="all"
        currentUser={null}
        onOwnerFilterChange={vi.fn()}
        page={1}
        pageCount={1}
        pageNumbers={[1]}
        onStatusFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onRerun={vi.fn()}

        onLoadInputs={vi.fn()}
        onExportWorkflow={vi.fn()}
        onRemoveVisible={vi.fn()}
        formatSubmittedAtRelative={() => "just now"}
        lastFetchedAt={null}
      />
    );

    expect(cancellingHtml).toContain("Next poll in");

    const failedHtml = renderToStaticMarkup(
      <RecentJobsPanel
        jobs={[createJob({ jobId: "job-failed" })]}
        warningJobIds={[]}
        cancelingJobIds={[]}
        statusFilter="All"
        ownerFilter="all"
        currentUser={null}
        onOwnerFilterChange={vi.fn()}
        page={1}
        pageCount={1}
        pageNumbers={[1]}
        onStatusFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onRerun={vi.fn()}

        onLoadInputs={vi.fn()}
        onExportWorkflow={vi.fn()}
        onRemoveVisible={vi.fn()}
        formatSubmittedAtRelative={() => "just now"}
        lastFetchedAt={null}
      />
    );

    expect(failedHtml).not.toContain("Next poll in");
  });

  it("measures terminal execution time from startedAt, not submittedAt", () => {
    const html = renderToStaticMarkup(
      <RecentJobsPanel
        jobs={[
          createJob({
            jobId: "job-started",
            submittedAt: "2026-05-23T10:00:00.000Z",
            lifecycle: {
              status: "COMPLETED",
              isTerminal: true,
              terminalReason: undefined,
              startedAt: "2026-05-23T10:05:00.000Z",
              finishedAt: "2026-05-23T10:10:00.000Z",
              lastCheckedAt: "2026-05-23T10:10:00.000Z",
              warning: null,
              executionTimeMs: undefined,
              failureReason: null
            }
          })
        ]}
        warningJobIds={[]}
        cancelingJobIds={[]}
        statusFilter="All"
        ownerFilter="all"
        currentUser={null}
        onOwnerFilterChange={vi.fn()}
        page={1}
        pageCount={1}
        pageNumbers={[1]}
        onStatusFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onRerun={vi.fn()}
        onLoadInputs={vi.fn()}
        onExportWorkflow={vi.fn()}
        onRemoveVisible={vi.fn()}
        formatSubmittedAtRelative={() => "just now"}
        lastFetchedAt={null}
      />
    );

    // 10:05 -> 10:10 is 5 minutes, not the 10 minutes from submittedAt.
    expect(html).toContain("5m 0s");
    expect(html).not.toContain("10m 0s");
  });
});
