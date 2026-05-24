import type { RecentJobRecord } from "../../../shared/contracts/jobs";
import type { RecentJobStatusFilter } from "./useRecentJobs";
import "../../styles/jobsOutput.css";

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
    <section className="jobs-panel" aria-label="recent-jobs-panel">
      <header className="jobs-panel-header">
        <h2>Recent Jobs</h2>
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
      </header>

      {props.jobs.length === 0 ? <p>No recent jobs yet</p> : null}

      {props.jobs.length > 0 ? (
        <ul className="jobs-list">
          {props.jobs.map((job) => {
            const executionTime = formatExecutionTime(job);
            const failureSnippet = formatFailureSnippet(job);
            return (
              <li key={job.jobId} className="jobs-card">
                <div className="jobs-card-meta">
                  <strong>{job.jobId}</strong>
                  <time dateTime={job.submittedAt} title={job.submittedAt}>
                    {props.formatSubmittedAtRelative(job.submittedAt)}
                  </time>
                </div>
                <div className="jobs-status-row">
                  <span className="jobs-status-chip">Status: {job.lifecycle.status}</span>
                  {props.warningJobIds.includes(job.jobId) ? (
                    <span className="jobs-status-chip jobs-warning-chip">Polling warning</span>
                  ) : null}
                </div>
                {executionTime ? <span>Execution time: {executionTime}</span> : null}
                {failureSnippet ? <p>{failureSnippet}</p> : null}
                <div className="jobs-actions">
                  {!job.lifecycle.isTerminal && job.lifecycle.status !== "CANCELLING" ? (
                    <button
                      className="btn btn-destructive"
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
                  <button className="btn btn-secondary" type="button" onClick={() => props.onLoadInputs(job.jobId)}>
                    Load Inputs
                  </button>
                  <button className="btn btn-destructive" type="button" onClick={() => props.onRemoveVisible(job.jobId)}>
                    Remove
                  </button>
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