import { useEffect, useState } from "react";
import {
  archiveOwnerLabel,
  type UserArchiveSummary
} from "../../../shared/contracts/archives";
import { fetchUserArchives, userArchiveDownloadUrl } from "../../lib/api/archivesClient";
import "../../styles/credits.css";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${unitIndex === 0 ? value : value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

export function UserArchivesPanel() {
  const [users, setUsers] = useState<UserArchiveSummary[] | null>(null);
  const [error, setError] = useState("");

  function load(): void {
    setError("");
    void fetchUserArchives()
      .then(setUsers)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Failed to load archive usage");
      });
  }

  useEffect(load, []);

  const totalBytes = (users ?? []).reduce((sum, user) => sum + user.totalBytes, 0);

  return (
    <div className="section-stack">
      <p>Download every stored job record and output image for a user as a single .zip.</p>
      <div className="credit-table-wrap">
        <table className="credit-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Jobs</th>
              <th>Images</th>
              <th>Image size</th>
              <th>Metadata</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((user) => (
              <tr key={user.username}>
                <td>{archiveOwnerLabel(user.username)}</td>
                <td>{user.jobCount}</td>
                <td>{user.imageCount}</td>
                <td>{formatBytes(user.imageBytes)}</td>
                <td>{formatBytes(user.metadataBytes)}</td>
                <td>{formatBytes(user.totalBytes)}</td>
                <td>
                  {user.jobCount > 0 ? (
                    <a
                      className="btn btn-secondary"
                      href={userArchiveDownloadUrl(user.username)}
                      download
                    >
                      Download .zip
                    </a>
                  ) : (
                    <span className="status-inline">Nothing stored</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="section-stack">
        <span className="status-inline">{`Total stored: ${formatBytes(totalBytes)}`}</span>
        <button className="btn btn-secondary" type="button" onClick={load}>
          Refresh
        </button>
      </div>
      {error ? <p className="status-inline">{error}</p> : null}
    </div>
  );
}
