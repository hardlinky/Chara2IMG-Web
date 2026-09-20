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
