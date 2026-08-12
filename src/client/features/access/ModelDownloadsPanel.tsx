import { useEffect, useRef, useState } from "react";
import type { DownloadEntry } from "../../../shared/contracts/modelDownloads";
import {
  cancelDownload,
  deleteDownload,
  enqueueDownload,
  fetchDownloadFolders,
  fetchDownloads,
  fetchDownloadsConfig,
  refreshDownloadMetadata,
  restartDownload,
  type DownloadsConfig,
} from "../../lib/api/modelDownloadsClient";
import "../../styles/modelDownloads.css";

const PAGE_SIZE = 10;

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[i]}`;
}

function progressPercent(entry: DownloadEntry): number {
  if (entry.totalBytes <= 0) return entry.status === "finished" ? 100 : 0;
  return Math.min(100, Math.round((entry.bytesDownloaded / entry.totalBytes) * 100));
}

function statusLabel(status: DownloadEntry["status"]): string {
  switch (status) {
    case "queued": return "Queued";
    case "in_progress": return "Downloading";
    case "finished": return "Finished";
    case "cancelled": return "Cancelled";
    case "failed": return "Failed";
  }
}

function ProgressBar({ entry }: { entry: DownloadEntry }) {
  const pct = progressPercent(entry);
  const known = entry.totalBytes > 0;
  const showBytes = entry.bytesDownloaded > 0 || entry.status === "finished";

  return (
    <div className="model-dl-progress-row">
      <div className="model-dl-progress-track">
        <div
          className="model-dl-progress-fill"
          data-status={entry.status}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showBytes && (
        <span className="model-dl-progress-bytes">
          {formatBytes(entry.bytesDownloaded)}
          {known ? ` / ${formatBytes(entry.totalBytes)}` : ""}
        </span>
      )}
    </div>
  );
}

export function getCivitaiVersionStatus(entry: DownloadEntry): {
  kind: "latest" | "newer" | "unknown";
  label: string;
  url?: string;
} | null {
  if (entry.source !== "civitai" || !entry.metadataUpdatedAt) return null;
  if (!entry.civitaiModelVersionId || !entry.civitaiLatestModelVersionId) {
    return { kind: "unknown", label: "Version comparison unavailable" };
  }
  if (entry.civitaiModelVersionId === entry.civitaiLatestModelVersionId) {
    return { kind: "latest", label: "Latest version" };
  }
  return {
    kind: "newer",
    label: "Newer version available",
    url: entry.civitaiModelId
      ? `https://civitai.com/models/${entry.civitaiModelId}?modelVersionId=${entry.civitaiLatestModelVersionId}`
      : undefined
  };
}

export function DownloadCard({
  entry,
  civitaiKey,
  huggingfaceKey,
  onUpdated,
}: {
  entry: DownloadEntry;
  civitaiKey: string;
  huggingfaceKey: string;
  onUpdated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [metadataMessage, setMetadataMessage] = useState("");
  const [metadataError, setMetadataError] = useState(false);

  async function handleCancel() {
    setBusy(true);
    try { await cancelDownload(entry.id); onUpdated(); }
    finally { setBusy(false); }
  }

  const [removeFiles, setRemoveFiles] = useState(false);

  async function handleDelete() {
    setBusy(true);
    try { await deleteDownload(entry.id, removeFiles); onUpdated(); }
    finally { setBusy(false); }
  }

  async function handleRestart() {
    setBusy(true);
    try {
      await restartDownload(entry.id, civitaiKey || undefined, huggingfaceKey || undefined);
      onUpdated();
    } finally { setBusy(false); }
  }

  async function handleMetadataRefresh() {
    setBusy(true);
    setMetadataMessage("");
    setMetadataError(false);
    try {
      const result = await refreshDownloadMetadata(entry.id, civitaiKey || undefined);
      if (!result.ok) {
        setMetadataError(true);
        setMetadataMessage(result.error);
        return;
      }
      setMetadataMessage(`Metadata updated: ${result.entry.triggerWords?.length ?? 0} trigger words`);
      onUpdated();
    } catch (error) {
      setMetadataError(true);
      setMetadataMessage(error instanceof Error ? error.message : "Metadata refresh failed");
    } finally {
      setBusy(false);
    }
  }

  const isActive = entry.status === "queued" || entry.status === "in_progress";
  const isTerminal = entry.status === "finished" || entry.status === "cancelled" || entry.status === "failed";
  const canRestart = entry.status === "cancelled" || entry.status === "failed";
  const versionStatus = getCivitaiVersionStatus(entry);

  return (
    <li className="model-dl-card">
      <div className="model-dl-card-header">
        <span className="model-dl-filename" title={entry.filename}>{entry.filename}</span>
        <span className="model-dl-source-tag">
          {entry.source === "civitai" ? "CivitAI" : "HuggingFace"}
        </span>
        <span className="model-dl-status-chip" data-status={entry.status}>
          {statusLabel(entry.status)}
        </span>
      </div>

      <div className="model-dl-card-meta">
        <span>Path: <strong>{entry.destPath}</strong></span>
        <a className="model-dl-card-meta-url" href={entry.url} target="_blank" rel="noopener noreferrer" title={entry.url}>URL: {entry.url}</a>
        {entry.source === "civitai" && entry.triggerWords ? <span>{entry.triggerWords.length} trigger words</span> : null}
        {versionStatus?.url ? (
          <a className="model-dl-version-status" data-kind={versionStatus.kind} href={versionStatus.url} target="_blank" rel="noopener noreferrer">{versionStatus.label}</a>
        ) : versionStatus ? (
          <span className="model-dl-version-status" data-kind={versionStatus.kind}>{versionStatus.label}</span>
        ) : null}
      </div>

      <ProgressBar entry={entry} />

      {entry.error && <p className="model-dl-error">{entry.error}</p>}
      {metadataMessage ? <p className="model-dl-metadata-message" data-tone={metadataError ? "error" : "success"}>{metadataMessage}</p> : null}

      <div className="model-dl-actions">
        {entry.source === "civitai" && !isActive ? (
          <button className="btn btn-secondary" type="button" onClick={() => void handleMetadataRefresh()} disabled={busy}>
            Fetch newest metadata
          </button>
        ) : null}
        {isActive && (
          <button className="btn btn-secondary" type="button" onClick={() => void handleCancel()} disabled={busy}>
            Cancel
          </button>
        )}
        {canRestart && (
          <button className="btn btn-secondary" type="button" onClick={() => void handleRestart()} disabled={busy}>
            Restart
          </button>
        )}
        {isTerminal && (
          <>
            <label className="model-dl-delete-toggle">
              <input
                type="checkbox"
                checked={removeFiles}
                onChange={(e) => setRemoveFiles(e.target.checked)}
              />
              Remove file(s)
            </label>
            <button className="btn btn-secondary" type="button" onClick={() => void handleDelete()} disabled={busy}>
              Delete
            </button>
          </>
        )}
      </div>
    </li>
  );
}

export function ModelDownloadsPanel({ enabled }: { enabled: boolean }) {
  const [config, setConfig] = useState<DownloadsConfig | null>(null);
  const [civitaiKey, setCivitaiKey] = useState("");
  const [huggingfaceKey, setHuggingfaceKey] = useState("");
  const [url, setUrl] = useState("");
  const [destPath, setDestPath] = useState("");
  const [downloads, setDownloads] = useState<DownloadEntry[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const downloadsRef = useRef(downloads);
  downloadsRef.current = downloads;

  useEffect(() => {
    if (!enabled) return;
    void fetchDownloadsConfig().then(setConfig).catch(() => {});
    void fetchDownloadFolders().then(setFolders).catch(() => {});
  }, [enabled]);

  // Poll every 2 seconds while panel is open
  useEffect(() => {
    if (!enabled) return;

    async function poll() {
      try {
        const data = await fetchDownloads();
        setDownloads(data);
        // Refresh folder list after a download finishes (new folder may have been created)
        const hadActive = downloadsRef.current.some(
          (d) => d.status === "queued" || d.status === "in_progress",
        );
        const hasActive = data.some((d) => d.status === "queued" || d.status === "in_progress");
        if (hadActive && !hasActive) {
          void fetchDownloadFolders().then(setFolders).catch(() => {});
        }
      } catch {
        // ignore transient errors
      }
    }

    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => clearInterval(timer);
  }, [enabled]);

  if (!enabled) return null;

  function detectSource(rawUrl: string): "civitai" | "huggingface" | null {
    if (rawUrl.includes("civitai.com") || rawUrl.includes("civitai.red")) return "civitai";
    if (rawUrl.includes("huggingface.co")) return "huggingface";
    return null;
  }

  function canSubmit(): boolean {
    const trimmedUrl = url.trim();
    if (!trimmedUrl || !destPath.trim()) return false;
    const source = detectSource(trimmedUrl);
    if (!source) return false;
    if (source === "civitai" && !config?.civitaiKeyConfigured && !civitaiKey.trim()) return false;
    if (source === "huggingface" && !config?.huggingfaceKeyConfigured && !huggingfaceKey.trim()) return false;
    return true;
  }

  async function handleDownload() {
    if (!canSubmit()) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await enqueueDownload(
        url.trim(),
        destPath.trim(),
        civitaiKey.trim() || undefined,
        huggingfaceKey.trim() || undefined,
      );
      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }
      setDownloads((prev) => [...prev, result.entry]);
      setUrl("");
      setPage(1);
      // Ensure new folder appears in list
      void fetchDownloadFolders().then(setFolders).catch(() => {});
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleRefresh() {
    void fetchDownloads().then(setDownloads).catch(() => {});
  }

  const totalPages = Math.max(1, Math.ceil(downloads.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  // Show newest first
  const sorted = [...downloads].reverse();
  const pageItems = sorted.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  return (
    <section className="setup-card">
      <h2>Model Downloads</h2>
      <p>Download models to the network volume. One download runs at a time; others are queued.</p>

      <div className="setup-form">
        {/* API keys — hidden per-source when configured server-side */}
        <div className="model-dl-api-keys">
          {!config?.civitaiKeyConfigured && (
            <label className="field" htmlFor="dl-civitai-key">
              CivitAI API key
              <input
                className="input"
                id="dl-civitai-key"
                type="password"
                value={civitaiKey}
                onChange={(e) => setCivitaiKey(e.target.value)}
                autoComplete="off"
                placeholder="Session only — not saved"
              />
            </label>
          )}
          {!config?.huggingfaceKeyConfigured && (
            <label className="field" htmlFor="dl-hf-key">
              HuggingFace API key
              <input
                className="input"
                id="dl-hf-key"
                type="password"
                value={huggingfaceKey}
                onChange={(e) => setHuggingfaceKey(e.target.value)}
                autoComplete="off"
                placeholder="Session only — not saved"
              />
            </label>
          )}
        </div>

        <label className="field" htmlFor="dl-dest-path">
          Destination folder (relative to network volume)
          <input
            className="input"
            id="dl-dest-path"
            list="dl-folders-list"
            value={destPath}
            onChange={(e) => setDestPath(e.target.value)}
            placeholder="e.g. checkpoints"
            autoComplete="off"
          />
          <datalist id="dl-folders-list">
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </label>

        <div className="model-dl-url-row">
          <input
            className="input"
            id="dl-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://civitai.com/models/… or https://huggingface.co/…"
            autoComplete="off"
            onKeyDown={(e) => { if (e.key === "Enter" && canSubmit()) void handleDownload(); }}
          />
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => void handleDownload()}
            disabled={!canSubmit() || isSubmitting}
          >
            {isSubmitting ? "Queuing…" : "Download"}
          </button>
        </div>

        {submitError && <p className="status-inline" data-tone="error">{submitError}</p>}
      </div>

      {downloads.length > 0 && (
        <div className="section-stack" style={{ marginTop: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3>Downloads ({downloads.length})</h3>
            <button className="btn btn-secondary" type="button" onClick={handleRefresh} style={{ fontSize: "var(--font-size-sm)" }}>
              Refresh
            </button>
          </div>

          <ul className="model-dl-list">
            {pageItems.map((entry) => (
              <DownloadCard
                key={entry.id}
                entry={entry}
                civitaiKey={civitaiKey}
                huggingfaceKey={huggingfaceKey}
                onUpdated={handleRefresh}
              />
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="model-dl-pagination">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={clampedPage <= 1}
              >
                ‹ Prev
              </button>
              <span>Page {clampedPage} of {totalPages}</span>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={clampedPage >= totalPages}
              >
                Next ›
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
