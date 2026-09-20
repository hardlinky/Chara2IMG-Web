// Sentinel owner id for jobs with `createdBy === null` (submitted anonymously).
export const ANONYMOUS_ARCHIVE_OWNER = "__anonymous__";

export type UserArchiveSummary = {
  username: string;
  jobCount: number;
  imageCount: number;
  imageBytes: number;
  metadataBytes: number;
  totalBytes: number;
};

export function archiveOwnerLabel(username: string): string {
  return username === ANONYMOUS_ARCHIVE_OWNER ? "Anonymous (no account)" : username;
}
