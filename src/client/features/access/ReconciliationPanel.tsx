import { useEffect, useMemo, useState } from "react";
import type { JobImageRecord, JobManifestEntry } from "../../../shared/contracts/jobs";
import {
  deleteServerImage,
  fetchAdminManifest,
  parseImageCacheKey,
  recacheImageFromServer
} from "../../lib/api/adminManifestClient";
import { deleteImage, listCachedImages } from "../../lib/imageCache";
import { confirmDeletion } from "../../lib/confirmDelete";

type ClientEntry = { cacheKey: string; expiresAt: number };

type ClientCell = {
  cacheKey: string;
  expiresAt: number;
  expired: boolean;
};

type ReconcileRow = {
  key: string;
  jobId: string;
  index: number;
  displayName: string;
  server: JobImageRecord | null;
  client: ClientCell | null;
};

function buildRows(serverEntries: JobManifestEntry[], clientEntries: ClientEntry[]): ReconcileRow[] {
  const now = Date.now();
  const rows = new Map<string, ReconcileRow>();

  for (const entry of serverEntries) {
    for (const image of entry.images) {
      const key = `${entry.jobId}:${image.imageIndex}`;
      rows.set(key, {
        key,
        jobId: entry.jobId,
        index: image.imageIndex,
        displayName: entry.displayName,
        server: image,
        client: null
      });
    }
  }

  for (const entry of clientEntries) {
    const parsed = parseImageCacheKey(entry.cacheKey);
    if (!parsed) {
      continue;
    }

    const key = `${parsed.jobId}:${parsed.index}`;
    const client: ClientCell = {
      cacheKey: entry.cacheKey,
      expiresAt: entry.expiresAt,
      expired: entry.expiresAt <= now
    };

    const existing = rows.get(key);
    if (existing) {
      existing.client = client;
    } else {
      rows.set(key, {
        key,
        jobId: parsed.jobId,
        index: parsed.index,
        displayName: parsed.jobId.slice(0, 8),
        server: null,
        client
      });
    }
  }

  return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function isMismatch(row: ReconcileRow): boolean {
  const hasServer = row.server !== null;
  const hasClient = row.client !== null;

  if (hasServer && !hasClient) {
    return true;
  }
  if (hasClient && !hasServer) {
    return true;
  }
  if (hasClient && row.client?.expired && hasServer) {
    return true;
  }
  if (hasServer && (row.server?.isPinned || row.server?.isArchived) && !hasClient) {
    return true;
  }
  return false;
}

function formatTtl(expiresAt: number): string {
  const deltaMs = expiresAt - Date.now();
  if (deltaMs <= 0) {
    return "expired";
  }

  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 60) {
    return `${minutes}m left`;
  }

  const hours = Math.round(minutes / 60);
  return `${hours}h left`;
}

export function ReconciliationPanel() {
  const [serverEntries, setServerEntries] = useState<JobManifestEntry[] | null>(null);
  const [clientEntries, setClientEntries] = useState<ClientEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [showMismatchOnly, setShowMismatchOnly] = useState(false);

  async function refresh(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const [server, client] = await Promise.all([fetchAdminManifest(), listCachedImages()]);
      setServerEntries(server);
      setClientEntries(client);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reconciliation data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // Mount-only fetch — manual refresh thereafter (no polling).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => {
    if (serverEntries === null || clientEntries === null) {
      return [];
    }
    return buildRows(serverEntries, clientEntries);
  }, [serverEntries, clientEntries]);

  const visibleRows = useMemo(
    () => (showMismatchOnly ? rows.filter(isMismatch) : rows),
    [rows, showMismatchOnly]
  );

  function dropServerImage(jobId: string, index: number): void {
    setServerEntries((current) => {
      if (!current) {
        return current;
      }
      return current
        .map((entry) =>
          entry.jobId === jobId
            ? { ...entry, images: entry.images.filter((image) => image.imageIndex !== index) }
            : entry
        )
        .filter((entry) => entry.jobId !== jobId || entry.images.length > 0);
    });
  }

  function dropClientImage(cacheKey: string): void {
    setClientEntries((current) => (current ? current.filter((entry) => entry.cacheKey !== cacheKey) : current));
  }

  async function handleDelete(row: ReconcileRow): Promise<void> {
    const ok = await confirmDeletion({
      message: "Delete this image from the server? This can't be undone.",
      confirmLabel: "Delete"
    });
    if (!ok) return;
    setBusyKey(row.key);
    setError(null);
    try {
      await deleteServerImage(row.jobId, row.index);
      dropServerImage(row.jobId, row.index);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete server image.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleCopy(row: ReconcileRow): Promise<void> {
    setBusyKey(row.key);
    setError(null);
    try {
      await recacheImageFromServer(row.jobId, row.index);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy image to client cache.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleEvict(row: ReconcileRow): Promise<void> {
    if (!row.client) {
      return;
    }
    const cacheKey = row.client.cacheKey;
    setBusyKey(row.key);
    setError(null);
    try {
      await deleteImage(cacheKey);
      dropClientImage(cacheKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to evict client image.");
    } finally {
      setBusyKey(null);
    }
  }

  const isInitialLoading = serverEntries === null;

  return (
    <section className="setup-card section-stack">
      <div className="reconcile-header">
        <h2>Reconciliation</h2>
        <div className="reconcile-header-actions">
          <label className="reconcile-toggle">
            <input
              type="checkbox"
              checked={showMismatchOnly}
              onChange={(event) => setShowMismatchOnly(event.target.checked)}
            />
            Mismatches only
          </label>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="status-inline" data-tone="error">
          {error}
        </p>
      ) : null}

      {isInitialLoading ? (
        <p>Loading reconciliation data…</p>
      ) : visibleRows.length === 0 ? (
        <p>{showMismatchOnly ? "No mismatches." : "No images on server or in client cache."}</p>
      ) : (
        <div className="reconcile-list">
          <div className="reconcile-grid reconcile-grid--head">
            <div className="reconcile-col-head">Server manifest</div>
            <div className="reconcile-col-head">Client cache</div>
          </div>
          {visibleRows.map((row) => {
            const mismatch = isMismatch(row);
            const busy = busyKey === row.key;
            const clientMissingOrExpired = !row.client || row.client.expired;

            return (
              <div
                key={row.key}
                className={`reconcile-grid reconcile-row${mismatch ? " reconcile-row--mismatch" : ""}`}
              >
                <div className="reconcile-cell">
                  {row.server ? (
                    <>
                      <span className="reconcile-name">
                        {row.displayName} <span className="reconcile-index">#{row.index}</span>
                      </span>
                      <span className="reconcile-badges">
                        {row.server.isPinned ? <span className="reconcile-badge">pinned</span> : null}
                        {row.server.isArchived ? <span className="reconcile-badge">archived</span> : null}
                      </span>
                      <span className="reconcile-actions">
                        <button
                          className="btn btn-destructive"
                          type="button"
                          onClick={() => void handleDelete(row)}
                          disabled={busy}
                        >
                          Delete
                        </button>
                        {clientMissingOrExpired ? (
                          <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={() => void handleCopy(row)}
                            disabled={busy}
                          >
                            Copy →
                          </button>
                        ) : null}
                      </span>
                    </>
                  ) : (
                    <span className="reconcile-empty">— not on server —</span>
                  )}
                </div>

                <div className="reconcile-cell">
                  {row.client ? (
                    <>
                      <span className="reconcile-name">
                        {row.displayName} <span className="reconcile-index">#{row.index}</span>
                      </span>
                      <span className="reconcile-badges">
                        <span className="reconcile-badge">
                          {row.client.expired ? "expired" : "cached"}
                        </span>
                        <span className="reconcile-ttl">{formatTtl(row.client.expiresAt)}</span>
                      </span>
                      <span className="reconcile-actions">
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => void handleEvict(row)}
                          disabled={busy}
                        >
                          Evict
                        </button>
                      </span>
                    </>
                  ) : (
                    <span className="reconcile-empty">— not cached —</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
