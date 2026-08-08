import { useEffect, useState } from "react";
import type { RecentJobRecord } from "../../../shared/contracts/jobs";
import { formatOutputJobId } from "../outputs/formatOutputJobId";
import { TrackedInputsPanel } from "../outputs/TrackedInputsPanel";
import { useTrackedInputCategories } from "../../lib/inputTrackingStorage";
import { confirmDeletion } from "../../lib/confirmDelete";
import { projectJobOutputCluster } from "../../lib/jobOutputProjection";
import { JOB_POLL_INTERVAL_MS } from "./jobStatus";
import type { RecentJobOwnerFilter, RecentJobStatusFilter } from "./useRecentJobs";
import "../../styles/jobsOutput.css";

type RecentJobsPanelProps = {
  jobs: RecentJobRecord[];
  filteredJobCount?: number;
  pinnedJobCount?: number;
  warningJobIds: string[];
  cancelingJobIds: string[];
  statusFilter: RecentJobStatusFilter;
  ownerFilter: RecentJobOwnerFilter;
  currentUser: string | null;
  page: number;
  pageCount: number;
  pageNumbers: number[];
  onStatusFilterChange: (next: RecentJobStatusFilter) => void;
  onOwnerFilterChange: (next: RecentJobOwnerFilter) => void;
  onPageChange: (next: number) => void;
  onCancel: (jobId: string) => void;
  onRerun: (jobId: string) => void;
  onLoadInputs: (jobId: string) => void;
  onExportWorkflow: (jobId: string) => void;
  onRemoveVisible: (jobId: string) => void;
  onViewOutputs?: (jobId: string) => void;
  formatSubmittedAtRelative: (submittedAt: string) => string;
  lastFetchedAt: number | null;
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

function formatExecutionTime(job: RecentJobRecord, now: number): string | null {
  function toHmsLabel(totalMs: number): string {
    const totalSeconds = Math.max(0, Math.round(totalMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts: string[] = [];
    if (hours > 0) {
      parts.push(`${hours}h`);
    }
    if (minutes > 0) {
      parts.push(`${minutes}m`);
    }
    parts.push(`${seconds}s`);
    return parts.join(" ");
  }

  if (typeof job.lifecycle.executionTimeMs === "number" && Number.isFinite(job.lifecycle.executionTimeMs)) {
    return toHmsLabel(job.lifecycle.executionTimeMs);
  }

  const submittedAtMs = Date.parse(job.submittedAt);
  if (!Number.isFinite(submittedAtMs)) {
    return null;
  }

  // Prefer the moment the job started executing; fall back to submission time
  // for jobs recorded before start tracking existed.
  const startedAtMs = job.lifecycle.startedAt ? Date.parse(job.lifecycle.startedAt) : NaN;
  const startMs = Number.isFinite(startedAtMs) ? startedAtMs : submittedAtMs;

  if (!job.lifecycle.isTerminal && job.lifecycle.status === "IN_PROGRESS") {
    const elapsedMs = Math.max(0, now - startMs);
    return toHmsLabel(elapsedMs);
  }

  if (job.lifecycle.isTerminal && job.lifecycle.finishedAt) {
    const finishedAtMs = Date.parse(job.lifecycle.finishedAt);
    if (Number.isFinite(finishedAtMs) && finishedAtMs >= startMs) {
      return toHmsLabel(finishedAtMs - startMs);
    }
  }

  return null;
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

function formatHumanDateTime(isoValue: string | undefined | null): string {
  if (!isoValue) {
    return "unknown";
  }

  const date = new Date(isoValue);
  if (!Number.isFinite(date.getTime())) {
    return isoValue;
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatJobTimestampTooltip(job: RecentJobRecord, executionTime: string | null): string {
  const parts = [`Submitted: ${formatHumanDateTime(job.submittedAt)}`];

  if (job.lifecycle.finishedAt) {
    parts.push(`Finished: ${formatHumanDateTime(job.lifecycle.finishedAt)}`);
  }

  if (executionTime) {
    parts.push(`Duration: ${executionTime}`);
  }

  return parts.join(" | ");
}

function formatNextPollCountdown(lastFetchedAt: number | null, now: number): string {
  if (lastFetchedAt === null) return "...";
  const nextPollAt = lastFetchedAt + JOB_POLL_INTERVAL_MS;
  const remainingMs = Math.max(0, nextPollAt - now);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  return `${remainingSeconds}s`;
}

// Fetches inputs only after first expansion to avoid one request per job on load.
function JobInputsDisclosure({ jobId }: { jobId: string }) {
  const trackedCategories = useTrackedInputCategories();
  const [opened, setOpened] = useState(false);
  if (trackedCategories.length === 0) {
    return null;
  }
  return (
    <details
      className="jobs-inputs-disclosure"
      onToggle={(event) => {
        if ((event.currentTarget as HTMLDetailsElement).open) setOpened(true);
      }}
    >
      <summary>Tracked inputs</summary>
      {opened ? <TrackedInputsPanel jobId={jobId} /> : null}
    </details>
  );
}

export function RecentJobsPanel(props: RecentJobsPanelProps) {
  const [now, setNow] = useState(() => Date.now());
  const filteredJobCount = props.filteredJobCount ?? props.jobs.length;

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  return (
    <section className="jobs-panel" aria-label="recent-jobs-panel">
      <header className="jobs-panel-header">
        <h2>Recent Jobs</h2>
        <span className="jobs-pin-counter">Pinned jobs: {props.pinnedJobCount ?? 0}</span>
        <span className="jobs-filtered-counter">Filtered jobs: {filteredJobCount}</span>
        <div className="jobs-toolbar-controls">
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
          <label className="field">
            Owner
            <select className="select" value={props.ownerFilter} onChange={(event) => props.onOwnerFilterChange(event.target.value as RecentJobOwnerFilter)}>
              <option value="all">All</option>
              <option value="own">Mine</option>
              <option value="anonymous">Anon</option>
            </select>
          </label>
        </div>
      </header>

      {props.jobs.length === 0 ? <p>No recent jobs yet</p> : null}

      {props.jobs.length > 0 ? (
        <ul className="jobs-list">
          {props.jobs.map((job) => {
            const displayJobId = formatOutputJobId(job.jobId);
            const hasOutputs = projectJobOutputCluster(job) !== null;
            const isPinnedJob = Boolean(job.pinnedAt) || Boolean(job.pinnedOutputIndices?.length);
            const executionTime = formatExecutionTime(job, now);
            const failureSnippet = formatFailureSnippet(job);
            const workerId = job.workerId ?? findWorkerId(job.lastResponse);
            const completionTimestamp = job.lifecycle.finishedAt ?? job.submittedAt;
            const completionTimeLabel = props.formatSubmittedAtRelative(completionTimestamp);
            const showInlineDuration = Boolean(job.lifecycle.isTerminal && executionTime);
            const completionMeta = showInlineDuration ? `${completionTimeLabel} (${executionTime})` : completionTimeLabel;
            const timestampTooltip = formatJobTimestampTooltip(job, executionTime);
            return (
              <li key={job.jobId} className="jobs-card">
                <div className="jobs-card-meta">
                  <strong className="jobs-card-id">
                    <span>{displayJobId}</span>
                    <span className="jobs-owner-chip" data-owner={(job.createdBy ?? null) === null ? "anonymous" : job.createdBy === props.currentUser ? "you" : "other"}>
                      {(job.createdBy ?? null) === null ? "Anon" : job.createdBy === props.currentUser ? "You" : job.createdBy}
                    </span>
                    {workerId ? <span className="jobs-card-worker">Worker: {workerId}</span> : null}
                    {isPinnedJob ? <span className="jobs-card-pinned-icon" aria-label="Pinned job" title="Pinned job">📌</span> : null}
                  </strong>
                  <time dateTime={completionTimestamp} title={timestampTooltip}>
                    {completionMeta}
                  </time>
                </div>
                <span>Workflow: {job.provenance.workflowFileName ?? "Workflow unknown"}</span>
                <div className="jobs-status-row">
                  <span className="jobs-status-chip" data-status={job.lifecycle.status}>{job.lifecycle.status}</span>
                  {!job.lifecycle.isTerminal ? <span className="jobs-next-poll">Next poll in {formatNextPollCountdown(props.lastFetchedAt, now)}</span> : null}
                  {props.warningJobIds.includes(job.jobId) ? (
                    <span className="jobs-status-chip jobs-warning-chip">Polling warning</span>
                  ) : null}
                </div>
                {executionTime && !showInlineDuration ? <span>Execution time: {executionTime}</span> : null}
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
                      onClick={() => {
                        void confirmDeletion({ message: "Delete this job from your history? This can't be undone.", confirmLabel: "Delete job" }).then((ok) => {
                          if (ok) props.onRemoveVisible(job.jobId);
                        });
                      }}
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
                  <div className="jobs-icon-actions" aria-label={`Quick actions for ${displayJobId}`}>
                    <button
                      className="jobs-icon-btn"
                      type="button"
                      onClick={() => props.onLoadInputs(job.jobId)}
                      aria-label={`Load inputs from ${displayJobId}`}
                      title={`Load inputs from ${displayJobId}`}
                    >
                      <LoadInputsIcon />
                    </button>
                  {job.lifecycle.status === "COMPLETED" ? (
                    <>
                      <button
                        className="jobs-icon-btn"
                        type="button"
                        onClick={() => props.onExportWorkflow(job.jobId)}
                        aria-label={`Export workflow for ${displayJobId}`}
                        title={`Export workflow for ${displayJobId}`}
                      >
                        <ExportWorkflowIcon />
                      </button>
                      {props.onViewOutputs ? (
                        <button
                          className="jobs-icon-btn"
                          type="button"
                          disabled={!hasOutputs}
                          onClick={() => props.onViewOutputs?.(job.jobId)}
                          aria-label={hasOutputs ? `View outputs for ${displayJobId}` : `No outputs available for ${displayJobId}`}
                          title={hasOutputs ? `View outputs for ${displayJobId}` : "No outputs available"}
                        >
                          <ViewOutputsIcon />
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  </div>
                </div>
                <JobInputsDisclosure jobId={job.jobId} />
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="jobs-pagination" aria-label="recent jobs pagination">
        <button className="btn btn-secondary" type="button" disabled={props.page <= 1} onClick={() => props.onPageChange(props.page - 1)}>
          Prev page
        </button>
        <span>{`Page ${props.page} / ${props.pageCount}`}</span>
        <button className="btn btn-secondary" type="button" disabled={props.page >= props.pageCount} onClick={() => props.onPageChange(props.page + 1)}>
          Next page
        </button>
      </div>
    </section>
  );
}