import type { UserArchiveSummary } from "../../../shared/contracts/archives";

export async function fetchUserArchives(): Promise<UserArchiveSummary[]> {
  const response = await fetch("/api/admin/archives", { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Failed to load archive usage: ${response.status}`);
  }
  const body = (await response.json()) as { ok: boolean; users: UserArchiveSummary[] };
  return body.users;
}

export function userArchiveDownloadUrl(username: string): string {
  return `/api/admin/archives/${encodeURIComponent(username)}/download`;
}

export type ArchiveImportResult = {
  importedJobs: number;
  importedImages: number;
  skippedExistingJobs: number;
  ignoredEntries: number;
  warnings: string[];
};

export async function importArchive(file: File): Promise<ArchiveImportResult> {
  const response = await fetch("/api/admin/archives/import", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/zip" },
    body: file
  });
  const body = (await response.json()) as ArchiveImportResult & { ok: boolean; error?: string };
  if (!response.ok || !body.ok) {
    throw new Error(body.error ?? `Import failed: ${response.status}`);
  }
  return body;
}
