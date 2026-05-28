import { useEffect, useMemo, useState } from "react";
import { fetchPinnedImageClientsViaProxy, prunePinnedImagesViaProxy, type PinnedImageClientUsage } from "../../lib/api/pinnedImageClient";

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
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

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

  const selectedCount = selectedClientIds.length;
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
    if (!enabled || selectedClientIds.length === 0) {
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const result = await prunePinnedImagesViaProxy({ keepClientIds: selectedClientIds });
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
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
          <button className="btn btn-secondary" type="button" onClick={() => void loadClients()} disabled={loading}>
            Refresh Clients
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
