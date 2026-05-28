import { useEffect, useMemo, useState } from "react";
import {
  fetchPinnedImageClientsViaProxy,
  getOrCreatePinnedImageClientId,
  previewPrunePinnedImagesViaProxy,
  prunePinnedImagesViaProxy,
  type PinnedImageClientUsage
} from "../../lib/api/pinnedImageClient";

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

type AdminTabProps = {
  enabled: boolean;
};

export function AdminTab({ enabled }: AdminTabProps) {
  const [clients, setClients] = useState<PinnedImageClientUsage[]>([]);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [manualClientIdsText, setManualClientIdsText] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const currentClientId = getOrCreatePinnedImageClientId();

  const manualClientIds = useMemo(
    () =>
      manualClientIdsText
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    [manualClientIdsText]
  );

  const keepClientIds = useMemo(() => [...new Set([...selectedClientIds, ...manualClientIds])], [manualClientIds, selectedClientIds]);

  async function loadClients(): Promise<void> {
    if (!enabled) {
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const nextClients = await fetchPinnedImageClientsViaProxy();
      setClients(nextClients);
      setSelectedClientIds((previous) => previous.filter((clientId) => nextClients.some((entry) => entry.clientId === clientId)));
    } catch {
      setStatus("Failed to load archived-image clients.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadClients();
  }, [enabled]);

  const selectedCount = keepClientIds.length;
  const totalBytes = useMemo(() => clients.reduce((sum, client) => sum + client.bytes, 0), [clients]);

  function toggleClient(clientId: string): void {
    setSelectedClientIds((previous) => {
      if (previous.includes(clientId)) {
        return previous.filter((item) => item !== clientId);
      }

      return [...previous, clientId];
    });
  }

  async function pruneToSelected(): Promise<void> {
    if (!enabled || keepClientIds.length === 0) {
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const result = await prunePinnedImagesViaProxy({ keepClientIds });
      setStatus(
        `Pruned archived images. Removed entries: ${result.removedEntries}. Deleted files: ${result.deletedFiles}. Kept entries: ${result.keptEntries}.`
      );
      await loadClients();
    } catch {
      setStatus("Prune request failed.");
    } finally {
      setLoading(false);
    }
  }

  async function previewPruneToSelected(): Promise<void> {
    if (!enabled || keepClientIds.length === 0) {
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const preview = await previewPrunePinnedImagesViaProxy({ keepClientIds });
      setStatus(
        `Dry run: preserve ${preview.keptEntries} images (${formatBytes(preview.keptBytes)}), prune ${preview.removedEntries} images (${formatBytes(preview.removedBytes)}).`
      );
    } catch {
      setStatus("Dry run request failed.");
    } finally {
      setLoading(false);
    }
  }

  if (!enabled) {
    return (
      <section className="setup-card">
        <p>Unlock admin access to view archived-image client controls.</p>
      </section>
    );
  }

  return (
    <div className="section-stack">
      <section className="setup-card">
        <h2>Archived Image Clients</h2>
        <p>Pick clients to preserve. Prune removes archived images for every other client ID.</p>
        <p>This list only shows client IDs that currently have archived entries on the server.</p>
        <p>{`Current browser client ID: ${currentClientId}`}</p>
        <p>{`Clients: ${clients.length} | Total archive bytes: ${formatBytes(totalBytes)}`}</p>
        <div className="field" style={{ display: "grid", gap: "0.5rem" }}>
          {clients.length === 0 ? <p>No archived clients found.</p> : null}
          {clients.map((client) => (
            <label key={client.clientId} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="checkbox"
                checked={selectedClientIds.includes(client.clientId)}
                onChange={() => toggleClient(client.clientId)}
              />
              <span>{`${client.clientId} (${formatBytes(client.bytes)}, ${client.entries} entries)`}</span>
            </label>
          ))}
        </div>
        <label className="field" htmlFor="manual-keep-client-ids" style={{ marginTop: "0.75rem" }}>
          Keep additional client IDs (comma or space separated)
          <input
            className="input"
            id="manual-keep-client-ids"
            type="text"
            value={manualClientIdsText}
            onChange={(event) => setManualClientIdsText(event.target.value)}
            placeholder="client-abc client-def"
          />
        </label>
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
          <button className="btn btn-secondary" type="button" onClick={() => void loadClients()} disabled={loading}>
            Refresh Clients
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setManualClientIdsText((previous) => (previous.includes(currentClientId) ? previous : `${previous} ${currentClientId}`.trim()))}
            disabled={loading}
          >
            Add Current Client ID
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => void previewPruneToSelected()} disabled={loading || selectedCount === 0}>
            {loading ? "Working..." : "Dry Run"}
          </button>
          <button className="btn btn-primary" type="button" onClick={() => void pruneToSelected()} disabled={loading || selectedCount === 0}>
            {loading ? "Working..." : `Prune To ${selectedCount} Selected`}
          </button>
        </div>
      </section>

      {status ? (
        <p role="status" className="status-inline">
          {status}
        </p>
      ) : null}
    </div>
  );
}
