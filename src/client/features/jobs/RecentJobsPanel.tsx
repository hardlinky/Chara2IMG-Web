import type { RecentJobRecord } from "../../../shared/contracts/jobs";
import type { RecentJobStatusFilter } from "./useRecentJobs";

type RecentJobsPanelProps = {
  jobs: RecentJobRecord[];
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
  onLoadInputs: (jobId: string) => void;
  onRemoveVisible: (jobId: string) => void;
  formatSubmittedAtRelative: (submittedAt: string) => string;
};

function formatExecutionTime(job: RecentJobRecord): string | null {
  if (job.lifecycle.executionTimeMs === undefined) {
    return null;
  }

  const seconds = Math.max(0, Math.round(job.lifecycle.executionTimeMs / 1000));
  return `${seconds}s`;
}

function formatFailureSnippet(job: RecentJobRecord): string | null {
  if (!job.lifecycle.failureReason) {
    return null;
  }

  return job.lifecycle.failureReason.length > 90 ? `${job.lifecycle.failureReason.slice(0, 90)}...` : job.lifecycle.failureReason;
}

export function RecentJobsPanel(props: RecentJobsPanelProps) {
  return (
    <section aria-label="recent-jobs-panel">
      <header>
        <h2>Recent Jobs</h2>
        <label>
          Status
          <select value={props.statusFilter} onChange={(event) => props.onStatusFilterChange(event.target.value as RecentJobStatusFilter)}>
            <option value="All">All</option>
            <option value="IN_QUEUE">In Queue</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="TIMED_OUT">Timed Out</option>
          </select>
        </label>
      </header>

      {props.jobs.length === 0 ? <p>No recent jobs yet</p> : null}

      {props.jobs.length > 0 ? (
        <ul>
          {props.jobs.map((job) => {
            const executionTime = formatExecutionTime(job);
            const failureSnippet = formatFailureSnippet(job);
            return (
              <li key={job.jobId}>
                <div>
                  <strong>{job.jobId}</strong>
                </div>
                <div>
                  <span>Status: {job.lifecycle.status}</span>
                  {props.warningJobIds.includes(job.jobId) ? <span>Polling warning</span> : null}
                </div>
                <time dateTime={job.submittedAt} title={job.submittedAt}>
                  {props.formatSubmittedAtRelative(job.submittedAt)}
                </time>
                {executionTime ? <span>Execution time: {executionTime}</span> : null}
                {failureSnippet ? <p>{failureSnippet}</p> : null}
                <div>
                  {!job.lifecycle.isTerminal && job.lifecycle.status !== "CANCELLING" ? (
                    <button type="button" disabled={props.cancelingJobIds.includes(job.jobId)} onClick={() => props.onCancel(job.jobId)}>
                      Cancel
                    </button>
                  ) : null}
                  <button type="button" onClick={() => props.onRerun(job.jobId)}>
                    Rerun
                  </button>
                  <button type="button" onClick={() => props.onLoadInputs(job.jobId)}>
                    Load Inputs
                  </button>
                  <button type="button" onClick={() => props.onRemoveVisible(job.jobId)}>
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <nav aria-label="recent jobs pagination">
        <button type="button" disabled={props.page <= 1} onClick={() => props.onPageChange(props.page - 1)}>
          Prev
        </button>
        {props.pageNumbers.map((pageNumber) => (
          <button key={pageNumber} type="button" aria-current={pageNumber === props.page ? "page" : undefined} onClick={() => props.onPageChange(pageNumber)}>
            {pageNumber}
          </button>
        ))}
        <button type="button" disabled={props.page >= props.pageCount} onClick={() => props.onPageChange(props.page + 1)}>
          Next
        </button>
      </nav>
    </section>
  );
}