import type { RecentJobRecord } from "../../../shared/contracts/jobs";
import type { RecentJobStatusFilter } from "./useRecentJobs";
import "../../styles/jobsOutput.css";

type RecentJobsPanelProps = {
  jobs: RecentJobRecord[];
  pinnedImageCount?: number;
  warningJobIds: string[];
  cancelingJobIds: string[];
  statusFilter: RecentJobStatusFilter;
  page: number;
  pageCount: number;
  pageNumbers: number[];
  onStatusFilterChange: (next: RecentJobStatusFilter) => void;
  onPageChange: (next: number) => void;
  onCancel: (jobId: string) => void;
  onRerun: (jobId: string) => void;
  onPollStatus: (jobId: string) => void;
  onLoadInputs: (jobId: string) => void;
  onExportWorkflow: (jobId: string) => void;
  onRemoveVisible: (jobId: string) => void;
  onViewOutputs?: (jobId: string) => void;
  formatSubmittedAtRelative: (submittedAt: string) => string;
};

function LoadInputsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path d="M4 7h16M4 12h10M4 17h7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M15 15h5v5m0-5-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExportWorkflowIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path d="M8 8h8v8M16 8l-8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 5h6M5 5v6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ViewOutputsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function formatExecutionTime(job: RecentJobRecord): string | null {
  if (job.lifecycle.executionTimeMs === undefined) {
    return null;
  }

  const seconds = Math.max(0, Math.round(job.lifecycle.executionTimeMs / 1000));
  return `${seconds}s`;
}

function extractStringValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return null;
}

function extractMessageFromUnknown(value: unknown): string | null {
  const direct = extractStringValue(value);
  if (direct) {
    return direct;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return extractStringValue(record.message) ?? extractStringValue(record.error) ?? extractStringValue(record.reason);
}

function findWorkerId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const directWorkerId = extractStringValue(record.workerId) ?? extractStringValue(record.worker_id);
  if (directWorkerId) {
    return directWorkerId;
  }

  const directWorker = record.worker;
  if (directWorker && typeof directWorker === "object" && !Array.isArray(directWorker)) {
    const worker = directWorker as Record<string, unknown>;
    const workerNestedId = extractStringValue(worker.id) ?? extractStringValue(worker.workerId) ?? extractStringValue(worker.worker_id);
    if (workerNestedId) {
      return workerNestedId;
    }
  }

  const nestedData = record.data;
  if (nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)) {
    const nestedRecord = nestedData as Record<string, unknown>;
    const nestedWorkerId = extractStringValue(nestedRecord.workerId) ?? extractStringValue(nestedRecord.worker_id);
    if (nestedWorkerId) {
      return nestedWorkerId;
    }

    const nestedWorker = nestedRecord.worker;
    if (nestedWorker && typeof nestedWorker === "object" && !Array.isArray(nestedWorker)) {
      const worker = nestedWorker as Record<string, unknown>;
      const nestedWorkerNestedId = extractStringValue(worker.id) ?? extractStringValue(worker.workerId) ?? extractStringValue(worker.worker_id);
      if (nestedWorkerNestedId) {
        return nestedWorkerNestedId;
      }
    }
  }

  return null;
}

function extractErrorFromResponse(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const directError = extractMessageFromUnknown(record.error) ?? extractStringValue(record.failureReason) ?? extractStringValue(record.reason);
  if (directError) {
    return directError;
  }

  const nestedData = record.data;
  if (nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)) {
    const nestedRecord = nestedData as Record<string, unknown>;
    const nestedError =
      extractMessageFromUnknown(nestedRecord.error) ??
      extractStringValue(nestedRecord.failureReason) ??
      extractStringValue(nestedRecord.reason);
    if (nestedError) {
      return nestedError;
    }
  }

  return null;
}

function formatFailureSnippet(job: RecentJobRecord): string | null {
  const failureMessage = job.lastError ?? job.lifecycle.failureReason ?? extractErrorFromResponse(job.lastResponse);

  if (!failureMessage) {
    return null;
  }

  return failureMessage.length > 90 ? `${failureMessage.slice(0, 90)}...` : failureMessage;
}

export function RecentJobsPanel(props: RecentJobsPanelProps) {
  return (
    <section className="jobs-panel" aria-label="recent-jobs-panel">
      <header className="jobs-panel-header">
        <h2>Recent Jobs</h2>
        <div className="jobs-toolbar-controls">
          <span className="jobs-pin-counter">Pins: {props.pinnedImageCount ?? 0}</span>
          <label className="field">
            Status
            <select className="select" value={props.statusFilter} onChange={(event) => props.onStatusFilterChange(event.target.value as RecentJobStatusFilter)}>
              <option value="All">All</option>
              <option value="IN_QUEUE">In Queue</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="TIMED_OUT">Timed Out</option>
            </select>
          </label>
        </div>
      </header>

      {props.jobs.length === 0 ? <p>No recent jobs yet</p> : null}

      {props.jobs.length > 0 ? (
        <ul className="jobs-list">
          {props.jobs.map((job) => {
            const executionTime = formatExecutionTime(job);
            const failureSnippet = formatFailureSnippet(job);
            const workerId = findWorkerId(job.lastResponse);
            return (
              <li key={job.jobId} className="jobs-card">
                <div className="jobs-card-meta">
                  <strong>{job.jobId}</strong>
                  <time dateTime={job.submittedAt} title={job.submittedAt}>
                    {props.formatSubmittedAtRelative(job.submittedAt)}
                  </time>
                </div>
                {workerId ? <span>Worker ID: {workerId}</span> : null}
                <div className="jobs-status-row">
                  {!job.lifecycle.isTerminal ? (
                    <button
                      className="btn btn-secondary jobs-refresh-btn"
                      type="button"
                      aria-label="Refresh job status"
                      title="Refresh job status"
                      onClick={() => props.onPollStatus(job.jobId)}
                    >
                      ↻
                    </button>
                  ) : null}
                  <span className="jobs-status-chip">Status: {job.lifecycle.status}</span>
                  {props.warningJobIds.includes(job.jobId) ? (
                    <span className="jobs-status-chip jobs-warning-chip">Polling warning</span>
                  ) : null}
                </div>
                {executionTime ? <span>Execution time: {executionTime}</span> : null}
                {failureSnippet ? (
                  <p>
                    <strong>Error:</strong> {failureSnippet}
                  </p>
                ) : null}
                <div className="jobs-actions">
                  {/* Cancel/Remove buttons are mutually exclusive */}
                  {job.lifecycle.isTerminal ? (
                    <button
                      className="btn btn-destructive jobs-cancel-remove-btn"
                      type="button"
                      onClick={() => props.onRemoveVisible(job.jobId)}
                    >
                      Remove
                    </button>
                  ) : job.lifecycle.status !== "CANCELLING" ? (
                    <button
                      className="btn btn-destructive jobs-cancel-remove-btn"
                      type="button"
                      disabled={props.cancelingJobIds.includes(job.jobId)}
                      onClick={() => props.onCancel(job.jobId)}
                    >
                      Cancel
                    </button>
                  ) : null}
                  <button className="btn btn-primary" type="button" onClick={() => props.onRerun(job.jobId)}>
                    Rerun
                  </button>
                  <div className="jobs-icon-actions" aria-label={`Quick actions for ${job.jobId}`}>
                    <button
                      className="jobs-icon-btn"
                      type="button"
                      onClick={() => props.onLoadInputs(job.jobId)}
                      aria-label={`Load inputs from ${job.jobId}`}
                      title={`Load inputs from ${job.jobId}`}
                    >
                      <LoadInputsIcon />
                    </button>
                  {job.lifecycle.status === "COMPLETED" ? (
                    <>
                      <button
                        className="jobs-icon-btn"
                        type="button"
                        onClick={() => props.onExportWorkflow(job.jobId)}
                        aria-label={`Export workflow for ${job.jobId}`}
                        title={`Export workflow for ${job.jobId}`}
                      >
                        <ExportWorkflowIcon />
                      </button>
                      {props.onViewOutputs ? (
                        <button
                          className="jobs-icon-btn"
                          type="button"
                          onClick={() => props.onViewOutputs?.(job.jobId)}
                          aria-label={`View outputs for ${job.jobId}`}
                          title={`View outputs for ${job.jobId}`}
                        >
                          <ViewOutputsIcon />
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <nav className="jobs-pagination" aria-label="recent jobs pagination">
        <button className="btn btn-secondary" type="button" disabled={props.page <= 1} onClick={() => props.onPageChange(props.page - 1)}>
          Prev
        </button>
        {props.pageNumbers.map((pageNumber) => (
          <button
            key={pageNumber}
            className="btn btn-secondary"
            type="button"
            aria-current={pageNumber === props.page ? "page" : undefined}
            onClick={() => props.onPageChange(pageNumber)}
          >
            {pageNumber}
          </button>
        ))}
        <button className="btn btn-secondary" type="button" disabled={props.page >= props.pageCount} onClick={() => props.onPageChange(props.page + 1)}>
          Next
        </button>
      </nav>
    </section>
  );
}