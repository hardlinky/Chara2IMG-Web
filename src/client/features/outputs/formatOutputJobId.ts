export function formatOutputJobId(jobId: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < jobId.length; index += 1) {
    hash ^= jobId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}