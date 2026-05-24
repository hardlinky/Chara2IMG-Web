const FALLBACK_VERSION = "0.0.0";

export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : FALLBACK_VERSION;

function formatVersion(version: string): string {
  const [major, minor = "0", patch = "0"] = version.split(".");

  if (patch === "0") {
    return `v${major}.${minor}`;
  }

  return `v${major}.${minor}.${patch}`;
}

export const APP_VERSION_LABEL = formatVersion(APP_VERSION);