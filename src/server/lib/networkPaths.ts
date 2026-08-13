import { resolve } from "node:path";

// The network volume mounts at /workspace on this Pod; NETWORK_MOUNT_DIR lets
// that be overridden if the mount path is ever customized.
export function getNetworkMountDir(): string {
  return process.env.NETWORK_MOUNT_DIR?.trim() || "/workspace";
}

// A value starting with "/" is used as-is (absolute override, e.g. for
// ephemeral paths outside the network volume); otherwise it's resolved
// relative to the network mount directory.
export function resolveNetworkPath(envVar: string, defaultVal: string): string {
  const raw = process.env[envVar]?.trim() || defaultVal;
  return resolve(getNetworkMountDir(), raw);
}
