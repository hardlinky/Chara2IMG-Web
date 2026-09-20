import { useEffect, useRef, useState } from "react";
import {
  archiveOwnerLabel,
  type UserArchiveSummary
} from "../../../shared/contracts/archives";
import {
  abortArchiveUpload,
  archiveFingerprint,
  createArchiveUploadSession,
  fetchArchiveUploadProgress,
  fetchUserArchives,
  finishArchiveUpload,
  uploadArchiveChunks,
  userArchiveDownloadUrl,
  waitForArchiveImport,
  type ArchiveUploadSession
} from "../../lib/api/archivesClient";
import "../../styles/credits.css";

const PENDING_UPLOAD_STORAGE_KEY = "chara2imgArchiveImportUpload";

type PendingUpload = { uploadId: string; fingerprint: string; fileName: string; fileSize: number };

function readPendingUpload(): PendingUpload | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PENDING_UPLOAD_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingUpload;
    return typeof parsed?.uploadId === "string" && typeof parsed.fingerprint === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writePendingUpload(pending: PendingUpload | null): void {
  if (typeof window === "undefined") return;
  if (pending) {
    window.localStorage.setItem(PENDING_UPLOAD_STORAGE_KEY, JSON.stringify(pending));
  } else {
    window.localStorage.removeItem(PENDING_UPLOAD_STORAGE_KEY);
  }
}

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
  const [importStatus, setImportStatus] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [uploadTotalBytes, setUploadTotalBytes] = useState(0);
  const [resumable, setResumable] = useState<PendingUpload | null>(() => readPendingUpload());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function load(): void {
    setError("");
    void fetchUserArchives()
      .then(setUsers)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Failed to load archive usage");
      });
  }

  useEffect(load, []);

  // Drop a remembered upload whose server-side session is gone (expired or finished).
  useEffect(() => {
    const pending = readPendingUpload();
    if (!pending) return;
    void fetchArchiveUploadProgress(pending.uploadId)
      .then((progress) => {
        if (progress?.status !== "uploading") {
          writePendingUpload(null);
          setResumable(null);
        }
      })
      .catch(() => undefined);
  }, []);

  async function runImport(file: File, session: ArchiveUploadSession): Promise<void> {
    const controller = new AbortController();
    abortRef.current = controller;
    setIsImporting(true);
    setUploadTotalBytes(file.size);
    setUploadedBytes(Math.min(session.receivedBytes, file.size));

    const pending: PendingUpload = {
      uploadId: session.uploadId,
      fingerprint: archiveFingerprint(file),
      fileName: file.name,
      fileSize: file.size
    };
    writePendingUpload(pending);
    setResumable(pending);

    try {
      setImportStatus(`Uploading ${file.name}...`);
      await uploadArchiveChunks(file, session, {
        onProgress: setUploadedBytes,
        signal: controller.signal
      });

      setImportStatus("Unpacking archive on the server...");
      await finishArchiveUpload(session.uploadId);
      const result = await waitForArchiveImport(session.uploadId, { signal: controller.signal });

      const skipped = result.skippedExistingJobs > 0 ? `, ${result.skippedExistingJobs} already present` : "";
      setImportStatus(
        `Imported ${result.importedJobs} job${result.importedJobs === 1 ? "" : "s"} and ${result.importedImages} image${result.importedImages === 1 ? "" : "s"}${skipped}.`
      );
      writePendingUpload(null);
      setResumable(null);
      load();
    } catch (reason: unknown) {
      if (reason instanceof DOMException && reason.name === "AbortError") {
        setImportStatus("Upload paused. Pick the same file again to resume.");
      } else {
        setImportStatus(
          `${reason instanceof Error ? reason.message : "Import failed"} \u2014 pick the same file again to resume.`
        );
      }
    } finally {
      abortRef.current = null;
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleFileSelected(file: File): Promise<void> {
    const pending = readPendingUpload();
    if (pending && pending.fingerprint === archiveFingerprint(file)) {
      const progress = await fetchArchiveUploadProgress(pending.uploadId).catch(() => null);
      if (progress?.status === "uploading") {
        await runImport(file, {
          uploadId: pending.uploadId,
          chunkBytes: progress.chunkBytes,
          receivedBytes: progress.receivedBytes
        });
        return;
      }
      writePendingUpload(null);
      setResumable(null);
    }

    try {
      const session = await createArchiveUploadSession(file);
      await runImport(file, session);
    } catch (reason: unknown) {
      setImportStatus(reason instanceof Error ? reason.message : "Upload could not start");
    }
  }

  function cancelImport(): void {
    abortRef.current?.abort();
  }

  async function discardResumable(): Promise<void> {
    const pending = readPendingUpload();
    if (pending) {
      await abortArchiveUpload(pending.uploadId);
    }
    writePendingUpload(null);
    setResumable(null);
    setImportStatus("");
  }

  const uploadPercent = uploadTotalBytes > 0 ? Math.floor((uploadedBytes / uploadTotalBytes) * 100) : 0;
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
      <div className="field">
        <label htmlFor="archive-import-file">Import archive (.zip exported from another server)</label>
        <input
          id="archive-import-file"
          ref={fileInputRef}
          className="input"
          type="file"
          accept=".zip,application/zip"
          disabled={isImporting}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleFileSelected(file);
            }
          }}
        />
        <span className="status-inline">
          Uploaded in chunks, so an interrupted transfer resumes instead of restarting. Imported jobs keep their
          original owner and never expire; jobs this server already knows are skipped.
        </span>
        {isImporting ? (
          <div className="section-stack">
            <progress
              className="archive-import-progress"
              aria-label="Archive upload progress"
              style={{ width: "100%" }}
              value={uploadedBytes}
              max={uploadTotalBytes || 1}
            />
            <span className="status-inline">
              {`${uploadPercent}% \u2014 ${formatBytes(uploadedBytes)} / ${formatBytes(uploadTotalBytes)}`}
            </span>
            <button className="btn btn-secondary" type="button" onClick={cancelImport}>
              Pause upload
            </button>
          </div>
        ) : null}
        {!isImporting && resumable ? (
          <div className="section-stack">
            <span className="status-inline">
              {`Unfinished upload of "${resumable.fileName}" (${formatBytes(resumable.fileSize)}) \u2014 select that same file to resume.`}
            </span>
            <button className="btn btn-secondary" type="button" onClick={() => void discardResumable()}>
              Discard unfinished upload
            </button>
          </div>
        ) : null}
        {importStatus ? <p className="status-inline">{importStatus}</p> : null}
      </div>
    </div>
  );
}
