import { useState } from "react";
import { readClientManifest, type ClientManifestEntry } from "../../lib/clientPinnedManifest";
import { fetchMyServerManifestEntries, backupPinnedImageViaProxy, type ServerManifestEntry } from "../../lib/api/pinnedImageClient";
import { setRecentJobOutputPinned } from "../../lib/api/recentJobsClient";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function urlType(url: string): "server" | "data" | "remote" {
  if (url.startsWith("/api/pinned-images/")) return "server";
  if (url.startsWith("data:")) return "data";
  return "remote";
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

type ServerEntry = ServerManifestEntry & { jobId?: string; outputIndex?: number };

function parseConsumer(consumer: string): { jobId: string; outputIndex: number } | null {
  // format: clientId:jobId:outputIndex
  const parts = consumer.split(":");
  if (parts.length < 3) return null;
  const outputIndex = parseInt(parts[parts.length - 1]!, 10);
  const jobId = parts.slice(1, parts.length - 1).join(":");
  if (!jobId || !Number.isFinite(outputIndex)) return null;
  return { jobId, outputIndex };
}

export function PinnedManifestPanel() {
  const [clientEntries, setClientEntries] = useState<ClientManifestEntry[] | null>(null);
  const [serverEntries, setServerEntries] = useState<ServerEntry[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  function loadClient() {
    const manifest = readClientManifest();
    setClientEntries(manifest.entries);
  }

  async function loadServer() {
    setBusy("loading");
    try {
      const result = await fetchMyServerManifestEntries();
      const enriched: ServerEntry[] = result.entries.map((entry) => {
        const parsed = entry.consumers[0] ? parseConsumer(entry.consumers[0]) : null;
        return { ...entry, jobId: parsed?.jobId, outputIndex: parsed?.outputIndex };
      });
      setServerEntries(enriched);
    } catch {
      setStatus("Failed to load server manifest.");
    } finally {
      setBusy(null);
    }
  }

  function load() {
    loadClient();
    void loadServer();
  }

  async function uploadToServer(entry: ClientManifestEntry) {
    if (urlType(entry.imageUrl) !== "data") {
      setStatus(`Entry ${entry.jobId}:${entry.outputIndex} is not a local data URL — nothing to upload.`);
      return;
    }
    setBusy(`upload-${entry.jobId}-${entry.outputIndex}`);
    try {
      const mimeMatch = /^data:(image\/[a-z]+);/.exec(entry.imageUrl);
      const mimeType = (mimeMatch?.[1] ?? "image/png") as "image/png" | "image/jpeg" | "image/webp" | "image/gif";
      const result = await backupPinnedImageViaProxy({
        jobId: entry.jobId,
        outputIndex: entry.outputIndex,
        dataUrl: entry.imageUrl,
        mimeType,
        workflowFileName: entry.workflowFileName,
      });
      // Update the job record to use the new server URL so reconcile
      // doesn't immediately see the data: URL as a stale/backfilled ref.
      await setRecentJobOutputPinned(
        entry.jobId,
        entry.outputIndex,
        true,
        entry.pinnedAt ?? new Date().toISOString(),
        result.imageUrl
      );
      setStatus(`Uploaded ${entry.jobId}:${entry.outputIndex} to server.`);
      loadClient();
      await loadServer();
    } catch {
      setStatus(`Upload failed for ${entry.jobId}:${entry.outputIndex}.`);
    } finally {
      setBusy(null);
    }
  }

  async function pinFromServer(entry: ServerEntry) {
    if (!entry.jobId || entry.outputIndex === undefined) {
      setStatus("Cannot determine jobId/outputIndex from this entry's consumer key.");
      return;
    }
    setBusy(`pin-${entry.fileName}`);
    try {
      await setRecentJobOutputPinned(entry.jobId, entry.outputIndex, true);
      setStatus(`Pinned ${entry.jobId}:${entry.outputIndex}. Reload the Jobs tab to see changes.`);
    } catch {
      setStatus(`Failed to pin ${entry.jobId}:${entry.outputIndex}.`);
    } finally {
      setBusy(null);
    }
  }

  const serverFileNames = new Set(serverEntries?.map((e) => e.fileName) ?? []);
  const clientMissingOnServer = clientEntries?.filter(
    (e) => !e.serverFileName || !serverFileNames.has(e.serverFileName)
  ) ?? [];

  const clientJobKeys = new Set(
    clientEntries?.map((e) => `${e.jobId}:${e.outputIndex}`) ?? []
  );
  const serverMissingOnClient = serverEntries?.filter(
    (e) => !e.jobId || !clientJobKeys.has(`${e.jobId}:${e.outputIndex}`)
  ) ?? [];

  return (
    <section className="setup-card">
      <h2>Pinned Manifest Inspector</h2>
      <p style={{ fontSize: "var(--text-sm)", marginBottom: "0.75rem" }}>
        Compare what your browser knows about pinned images against what the server has stored.
      </p>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <button className="btn btn-secondary" type="button" onClick={load} disabled={busy === "loading"}>
          {busy === "loading" ? "Loading…" : "Load both manifests"}
        </button>
      </div>

      {status ? (
        <p role="status" style={{ fontSize: "var(--text-sm)", marginBottom: "0.75rem", color: "var(--color-warning, #e2894c)" }}>
          {status}
        </p>
      ) : null}

      {(clientEntries !== null || serverEntries !== null) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          {/* Client manifest */}
          <div>
            <h3 style={{ marginBottom: "0.5rem", fontSize: "var(--text-sm)", fontWeight: 600 }}>
              {`Client (${clientEntries?.length ?? 0} entries)`}
            </h3>
            {clientMissingOnServer.length > 0 && (
              <p style={{ fontSize: "var(--text-xs)", color: "var(--color-warning, #e2894c)", marginBottom: "0.5rem" }}>
                {`${clientMissingOnServer.length} not on server`}
              </p>
            )}
            <div style={{ display: "grid", gap: "0.3rem" }}>
              {(clientEntries ?? []).map((entry) => {
                const type = urlType(entry.imageUrl);
                const onServer = entry.serverFileName && serverFileNames.has(entry.serverFileName);
                const key = `${entry.jobId}:${entry.outputIndex}`;
                const isBusy = busy === `upload-${entry.jobId}-${entry.outputIndex}`;
                return (
                  <div
                    key={key}
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      borderRadius: 4,
                      padding: "0.4rem 0.5rem",
                      fontSize: "var(--text-xs)",
                      borderLeft: `3px solid ${onServer ? "rgba(80,200,120,0.6)" : type === "data" ? "rgba(226,137,76,0.6)" : "rgba(100,100,120,0.4)"}`,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{truncate(entry.jobId, 20)}:{entry.outputIndex}</div>
                    <div style={{ opacity: 0.7 }}>{entry.workflowFileName ?? "—"}</div>
                    <div style={{ opacity: 0.6 }}>
                      {type === "server" ? "✓ server URL" : type === "data" ? "⚠ local data URL" : "⚠ remote URL"}
                    </div>
                    {!onServer && type === "data" && (
                      <button
                        className="btn btn-secondary"
                        type="button"
                        style={{ marginTop: "0.25rem", fontSize: "var(--text-xs)", padding: "1px 6px" }}
                        onClick={() => void uploadToServer(entry)}
                        disabled={isBusy || busy !== null}
                      >
                        {isBusy ? "Uploading…" : "Upload to server →"}
                      </button>
                    )}
                  </div>
                );
              })}
              {(clientEntries ?? []).length === 0 && (
                <p style={{ fontSize: "var(--text-xs)", opacity: 0.6 }}>No pinned entries in client manifest.</p>
              )}
            </div>
          </div>

          {/* Server manifest */}
          <div>
            <h3 style={{ marginBottom: "0.5rem", fontSize: "var(--text-sm)", fontWeight: 600 }}>
              {`Server (${serverEntries?.length ?? 0} entries)`}
            </h3>
            {serverMissingOnClient.length > 0 && (
              <p style={{ fontSize: "var(--text-xs)", color: "var(--color-warning, #e2894c)", marginBottom: "0.5rem" }}>
                {`${serverMissingOnClient.length} not in client manifest`}
              </p>
            )}
            <div style={{ display: "grid", gap: "0.3rem" }}>
              {(serverEntries ?? []).map((entry) => {
                const inClient = entry.jobId && clientJobKeys.has(`${entry.jobId}:${entry.outputIndex}`);
                const isBusy = busy === `pin-${entry.fileName}`;
                return (
                  <div
                    key={entry.fileName}
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      borderRadius: 4,
                      padding: "0.4rem 0.5rem",
                      fontSize: "var(--text-xs)",
                      borderLeft: `3px solid ${inClient ? "rgba(80,200,120,0.6)" : "rgba(226,137,76,0.6)"}`,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{truncate(entry.fileName, 24)}</div>
                    <div style={{ opacity: 0.7 }}>{entry.workflowFileName ?? "—"}</div>
                    <div style={{ opacity: 0.6 }}>{formatBytes(entry.sizeBytes)}</div>
                    {entry.jobId && entry.outputIndex !== undefined && (
                      <div style={{ opacity: 0.6 }}>{truncate(entry.jobId, 20)}:{entry.outputIndex}</div>
                    )}
                    {!inClient && entry.jobId && entry.outputIndex !== undefined && (
                      <button
                        className="btn btn-secondary"
                        type="button"
                        style={{ marginTop: "0.25rem", fontSize: "var(--text-xs)", padding: "1px 6px" }}
                        onClick={() => void pinFromServer(entry)}
                        disabled={isBusy || busy !== null}
                      >
                        {isBusy ? "Pinning…" : "← Pin in jobs"}
                      </button>
                    )}
                  </div>
                );
              })}
              {serverEntries !== null && serverEntries.length === 0 && (
                <p style={{ fontSize: "var(--text-xs)", opacity: 0.6 }}>No entries in server manifest.</p>
              )}
              {serverEntries === null && (
                <p style={{ fontSize: "var(--text-xs)", opacity: 0.6 }}>Not loaded yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
