import { useEffect, useMemo, useState } from "react";
import {
  downloadPinnedImagesArchiveBatchViaProxy,
  downloadPinnedImagesArchiveViaProxy,
  fetchPinnedImageClientsViaProxy,
  getOrCreatePinnedImageClientId,
  getClientIdOverride,
  setClientIdOverride,
  previewPrunePinnedImagesViaProxy,
  prunePinnedImagesViaProxy,
  purgeMissingPinnedImagesViaProxy,
  purgeMissingClientPinnedImagesViaProxy,
  type PinnedImageClientUsage
} from "../../lib/api/pinnedImageClient";
import { listVisibleRecentJobs, removeRecentJobOutputImage as removeRecentJobOutputImageFromStorage, getRecentJob, restorePinsFromManifest } from "../../lib/api/recentJobsClient";
import { extractRunpodOutputImages } from "../../lib/runpodOutputImage";

const CLIENT_PAGE_SIZE = 10;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const decimals = unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

function describeProxyError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "Unknown error";
  }

  const status = (error as { status?: unknown }).status;
  const data = (error as { data?: unknown }).data;
  const message = (error as { message?: unknown }).message;
  const backendError = data && typeof data === "object" && "error" in (data as Record<string, unknown>)
    ? (data as Record<string, unknown>).error
    : undefined;

  if (status === 403) {
    return "Forbidden (403). Admin session may be expired - unlock Admin again.";
  }

  if (typeof backendError === "string" && backendError.trim()) {
    return typeof status === "number" ? `${backendError} (${status})` : backendError;
  }

  if (typeof message === "string" && message.trim()) {
    return message;
  }

  return typeof status === "number" ? `Request failed (${status})` : "Request failed";
}

type AdminTabProps = {
  enabled: boolean;
};

export function AdminTab({ enabled }: AdminTabProps) {
  const [clients, setClients] = useState<PinnedImageClientUsage[]>([]);
  const [selectedClientIdsText, setSelectedClientIdsText] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [impersonatedClientId, setImpersonatedClientId] = useState<string | null>(getClientIdOverride);
  const nativeClientId = useState(() => {
    // Snapshot the real client ID before any override is applied.
    const prev = getClientIdOverride();
    setClientIdOverride(null);
    const id = getOrCreatePinnedImageClientId();
    setClientIdOverride(prev);
    return id;
  })[0];
  const currentClientId = impersonatedClientId ?? nativeClientId;

  const selectedClientIds = useMemo(
    () =>
      selectedClientIdsText
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    [selectedClientIdsText]
  );

  const keepClientIds = useMemo(() => [...new Set(selectedClientIds)], [selectedClientIds]);
  const pageCount = Math.max(1, Math.ceil(clients.length / CLIENT_PAGE_SIZE));
  const pagedClients = useMemo(
    () => clients.slice((page - 1) * CLIENT_PAGE_SIZE, page * CLIENT_PAGE_SIZE),
    [clients, page]
  );

  async function loadClients(): Promise<void> {
    if (!enabled) {
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const nextClients = await fetchPinnedImageClientsViaProxy();
      if (!nextClients.some((c) => c.clientId === nativeClientId)) {
        nextClients.unshift({ clientId: nativeClientId, bytes: 0, entries: 0 });
      }
      setClients(nextClients);
      setSelectedClientIdsText((previous) => {
        const previousIds = previous
          .split(/[\s,]+/)
          .map((value) => value.trim())
          .filter((value) => value.length > 0);

        const filtered = previousIds.filter((clientId) => nextClients.some((entry) => entry.clientId === clientId));
        return filtered.join(" ");
      });
    } catch {
      setStatus("Failed to load archived-image clients.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadClients();
  }, [enabled]);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const selectedCount = keepClientIds.length;
  const totalBytes = useMemo(() => clients.reduce((sum, client) => sum + client.bytes, 0), [clients]);

  function toggleClient(clientId: string): void {
    setSelectedClientIdsText((previous) => {
      const ids = previous
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

      if (ids.includes(clientId)) {
        return ids.filter((value) => value !== clientId).join(" ");
      }

      return [...ids, clientId].join(" ");
    });
  }

  function applyImpersonation(clientId: string | null): void {
    setClientIdOverride(clientId);
    setImpersonatedClientId(clientId);
    setStatus(clientId ? `Now acting as: ${clientId}` : "Restored native client ID.");
  }

  async function pruneToSelected(): Promise<void> {
    if (!enabled || keepClientIds.length === 0) {
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const preview = await previewPrunePinnedImagesViaProxy({ keepClientIds });
      const previewSummary = `Dry run: preserve ${preview.keptEntries} images (${formatBytes(preview.keptBytes)}), prune ${preview.removedEntries} images (${formatBytes(preview.removedBytes)}), delete ${preview.orphanedFiles} orphaned files (${formatBytes(preview.orphanedBytes)}).`;
      setLoading(false);

      const confirmed = window.confirm(`${previewSummary}\n\nProceed with prune?`);
      if (!confirmed) {
        setStatus("Prune cancelled.");
        return;
      }

      setLoading(true);
      const result = await prunePinnedImagesViaProxy({ keepClientIds });
      setStatus(
        `Pruned archived images. Removed entries: ${result.removedEntries}. Deleted files: ${result.deletedFiles}. Orphaned files deleted: ${result.orphanedFilesDeleted}. Kept entries: ${result.keptEntries}.`
      );
      await loadClients();
    } catch {
      setStatus("Prune request failed.");
    } finally {
      setLoading(false);
    }
  }

  async function purgeMissing(): Promise<void> {
    const confirmed = window.confirm(
      enabled
        ? "Remove all manifest entries whose image files are missing from server storage? This clears stale records from prior container runs."
        : "Remove your archived image records that no longer exist on the server? This clears stale entries from prior container runs."
    );
    if (!confirmed) {
      setStatus("Purge cancelled.");
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const result = enabled
        ? await purgeMissingPinnedImagesViaProxy()
        : await purgeMissingClientPinnedImagesViaProxy();
      setStatus(`Purged missing images. Removed entries: ${result.removedEntries} of ${result.checkedEntries} checked.`);
      if (enabled) {
        await loadClients();
      }
    } catch (error) {
      setStatus(`Purge missing failed: ${describeProxyError(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function removeBrokenArchives(): Promise<void> {
    const confirmed = window.confirm("Scan all pinned archived images and unpin any that return 404 (unavailable)? This may take a moment.");
    if (!confirmed) {
      setStatus("Cancelled.");
      return;
    }

    setLoading(true);
    setStatus("Scanning archived images...");

    try {
      const jobs = await listVisibleRecentJobs();
      let checked = 0;
      let removed = 0;

      for (const job of jobs) {
        const hydrated = await getRecentJob(job.jobId);
        const pinnedIndices = new Set(hydrated?.pinnedOutputIndices ?? job.pinnedOutputIndices ?? []);
        const response = hydrated?.lastResponse ?? job.lastResponse;
        if (!response) {
          continue;
        }

        const images = extractRunpodOutputImages(response);
        for (let outputIndex = 0; outputIndex < images.length; outputIndex += 1) {
          const image = images[outputIndex];
          if (!image) {
            continue;
          }

          if (!image.dataUrl.startsWith("/api/pinned-images/")) {
            continue;
          }

          checked += 1;
          try {
            const res = await fetch(image.dataUrl, { method: "HEAD", credentials: "include" });
            if (res.status === 404) {
              await removeRecentJobOutputImageFromStorage(job.jobId, outputIndex);
              removed += 1;
            }
          } catch {
            // Network error — skip.
          }
        }
      }

      setStatus(`Done. Checked: ${checked}, removed: ${removed} broken archived images.`);
    } catch (error) {
      setStatus(`Failed: ${describeProxyError(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function downloadArchive(): Promise<void> {
    setLoading(true);
    setStatus("");

    try {
      if (enabled) {
        if (keepClientIds.length === 0) {
          setStatus("Select at least one client ID to download archives.");
          setLoading(false);
          return;
        }

        await downloadPinnedImagesArchiveBatchViaProxy(keepClientIds);
        setStatus(`Archive download started for ${keepClientIds.length} selected client(s).`);
      } else {
        await downloadPinnedImagesArchiveViaProxy();
        setStatus(`Archive download started for ${currentClientId}.`);
      }
    } catch (error) {
      setStatus(
        enabled
          ? `Failed to download selected client archives: ${describeProxyError(error)}`
          : `Failed to download archive for ${currentClientId}: ${describeProxyError(error)}`
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="section-stack">
      <section className="setup-card">
        <h2>{enabled ? "Archived Image Clients" : "Archive Download"}</h2>
        <p>{`Native client ID: ${nativeClientId}`}</p>
        {impersonatedClientId ? (
          <p style={{ color: "var(--color-warning, #e2894c)" }}>
            {`Acting as: ${impersonatedClientId} `}
            <button className="btn btn-secondary" type="button" style={{ fontSize: "var(--text-xs)", padding: "2px 8px" }} onClick={() => applyImpersonation(null)}>
              Reset
            </button>
          </p>
        ) : null}
        {enabled ? (
          <p>Pick clients to preserve. Prune removes archived images for every other client ID.</p>
        ) : (
          <p>Download your archived/pinned images as a zip file.</p>
        )}
        {enabled ? <p>{`Clients: ${clients.length} | Total archive bytes: ${formatBytes(totalBytes)}`}</p> : null}
        {enabled ? (
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
            <button className="btn btn-secondary" type="button" onClick={() => void downloadArchive()} disabled={loading || selectedCount === 0}>
              {loading ? "Working..." : "Download .zip"}
            </button>
            <button className="btn btn-primary" type="button" onClick={() => void pruneToSelected()} disabled={loading || selectedCount === 0}>
              {loading ? "Working..." : "Prune"}
            </button>
            <button className="btn btn-destructive" type="button" onClick={() => void purgeMissing()} disabled={loading}>
              {loading ? "Working..." : "Purge Missing"}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
            <button className="btn btn-secondary" type="button" onClick={() => void downloadArchive()} disabled={loading}>
              {loading ? "Working..." : "Download .zip"}
            </button>
            <button className="btn btn-destructive" type="button" onClick={() => void removeBrokenArchives()} disabled={loading}>
              {loading ? "Working..." : "Remove Unavailable"}
            </button>
            <button className="btn btn-destructive" type="button" onClick={() => void purgeMissing()} disabled={loading}>
              {loading ? "Working..." : "Purge Missing"}
            </button>
          </div>
        )}

        {enabled ? (
          <>
            <div className="admin-selection-row" style={{ marginTop: "0.75rem" }}>
              <label className="field admin-selection-field" htmlFor="act-as-client-id">
                Act as client ID
                <input
                  className="input"
                  id="act-as-client-id"
                  type="text"
                  value={impersonatedClientId ?? ""}
                  onChange={(event) => applyImpersonation(event.target.value || null)}
                  placeholder={nativeClientId}
                />
              </label>
              {impersonatedClientId ? (
                <button className="btn btn-secondary" type="button" onClick={() => applyImpersonation(null)} style={{ alignSelf: "flex-end" }}>
                  Reset
                </button>
              ) : null}
            </div>

            <div className="admin-selection-row">
              <label className="field admin-selection-field" htmlFor="client-selection-ids">
                Client selection
                <input
                  className="input"
                  id="client-selection-ids"
                  type="text"
                  value={selectedClientIdsText}
                  onChange={(event) => setSelectedClientIdsText(event.target.value)}
                  placeholder="client-abc client-def"
                />
              </label>
              <span className="admin-selection-count" aria-label={`Selected clients: ${selectedCount}`}>{selectedCount}</span>
            </div>

            <div className="field" style={{ display: "grid", gap: "0.4rem", marginTop: "0.75rem" }}>
              {clients.length === 0 ? <p>No archived clients found.</p> : null}
              {pagedClients.map((client) => {
                const selected = keepClientIds.includes(client.clientId);
                const isOwnClient = client.clientId === currentClientId;
                return (
                  <button
                    key={client.clientId}
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => toggleClient(client.clientId)}
                    onDoubleClick={() => applyImpersonation(client.clientId)}
                    style={{
                      textAlign: "left",
                      justifyContent: "flex-start",
                      borderColor: selected ? "rgba(226, 137, 76, 0.8)" : undefined,
                      background: isOwnClient ? "rgba(52, 94, 144, 0.28)" : undefined,
                      color: isOwnClient ? "#d7ecff" : undefined
                    }}
                  >
                    {`${client.clientId} (${formatBytes(client.bytes)}, ${client.entries} entries)`}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn btn-secondary" type="button" onClick={() => void loadClients()} disabled={loading}>
                Refresh Clients
              </button>
            </div>

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn btn-secondary" type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
                Prev Page
              </button>
              <span>{`${page} / ${pageCount}`}</span>
              <button className="btn btn-secondary" type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>
                Next Page
              </button>
            </div>

          </>
        ) : null}
      </section>

      {status ? (
        <p role="status" className="status-inline">
          {status}
        </p>
      ) : null}

      <section className="setup-card">
        <h2>Job Sync</h2>
        <p style={{ fontSize: "var(--text-sm)", marginBottom: "0.75rem" }}>
          If your recent jobs are missing, use this to re-upload them from browser storage to the server.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              window.localStorage.removeItem("chara2imgRecentJobsMigratedToServer");
              window.location.reload();
            }}
          >
            Re-sync jobs from browser
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={async () => {
              setStatus("Restoring pins…");
              setLoading(true);
              try {
                const updated = await restorePinsFromManifest();
                setStatus(updated > 0 ? `Restored pins on ${updated} job(s). Reload to see changes.` : "No pins needed restoring.");
              } catch {
                setStatus("Failed to restore pins.");
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
          >
            Restore pins from manifest
          </button>
        </div>
      </section>
    </div>
  );
}
