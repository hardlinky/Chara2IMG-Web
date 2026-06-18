/**
 * Client-side pinned manifest — a localStorage-backed snapshot of all pinned
 * outputs the client currently knows about. Acts as a safety backup that
 * survives server-side manifest loss.
 *
 * Entry layout mirrors the server manifest closely so the two can be compared
 * and entries can be copied in either direction.
 */

import type { RecentJobRecord } from "../../shared/contracts/jobs";
import { extractRunpodOutputImages } from "./runpodOutputImage";

const STORAGE_KEY = "chara2imgClientPinnedManifest.v1";

export type ClientManifestEntry = {
  jobId: string;
  outputIndex: number;
  /** "/api/pinned-images/filename.png"  |  "data:image/..."  |  "https://..." */
  imageUrl: string;
  /** Extracted from the /api/pinned-images/ URL if present, otherwise null */
  serverFileName: string | null;
  pinnedAt: string | null;
  workflowFileName?: string;
  updatedAt: string;
};

type ClientPinnedManifest = {
  version: 1;
  updatedAt: string;
  entries: ClientManifestEntry[];
};

function emptyManifest(): ClientPinnedManifest {
  return { version: 1, updatedAt: new Date().toISOString(), entries: [] };
}

export function readClientManifest(): ClientPinnedManifest {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyManifest();
    const parsed = JSON.parse(raw) as Partial<ClientPinnedManifest>;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return emptyManifest();
    return parsed as ClientPinnedManifest;
  } catch {
    return emptyManifest();
  }
}

function writeClientManifest(manifest: ClientPinnedManifest): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(manifest));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

function serverFileNameFromUrl(url: string): string | null {
  const marker = "/api/pinned-images/";
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  return decodeURIComponent(url.slice(idx + marker.length)).split("?")[0] ?? null;
}

/**
 * Rebuilds and persists the client manifest from the current list of visible
 * job records. Call whenever the job list changes.
 */
export function syncClientManifestFromJobs(jobs: RecentJobRecord[]): void {
  const now = new Date().toISOString();
  const entries: ClientManifestEntry[] = [];

  for (const job of jobs) {
    const response = job.lastResponse;
    if (!response) continue;

    const images = extractRunpodOutputImages(response);
    const pinnedIndices = new Set(job.pinnedOutputIndices ?? []);
    const legacyAllPinned = Boolean(job.pinnedAt) && pinnedIndices.size === 0;

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      if (!image) continue;
      if (!legacyAllPinned && !pinnedIndices.has(i)) continue;

      entries.push({
        jobId: job.jobId,
        outputIndex: i,
        imageUrl: image.dataUrl,
        serverFileName: serverFileNameFromUrl(image.dataUrl),
        pinnedAt: job.pinnedAt ?? null,
        workflowFileName: job.provenance.workflowFileName,
        updatedAt: now,
      });
    }
  }

  writeClientManifest({ version: 1, updatedAt: now, entries });
}

export function clearClientManifest(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
