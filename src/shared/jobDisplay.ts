// FNV-1a hash of jobId -> 8-char lowercase hex string.
// Computed once at job creation; stored as JobRecord.displayName.
// Never recomputed at render time.
export function formatJobDisplayName(jobId: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < jobId.length; index += 1) {
    hash ^= jobId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
