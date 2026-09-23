import { randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_RUNPOD_JOB_SETTINGS,
  normalizeRunpodJobSettings,
  type RunpodJobSettings
} from "../../shared/contracts/runpodSettings.js";
import { resolveNetworkPath } from "./networkPaths.js";

type RunpodSettingsFile = {
  settings: RunpodJobSettings;
  webhookSecret: string;
};

let writeChain: Promise<void> = Promise.resolve();

function getSettingsDir(): string {
  return resolveNetworkPath("RUNPOD_SETTINGS_DIR", "chara2img/settings");
}

function settingsFilePath(): string {
  return join(getSettingsDir(), "runpod.json");
}

async function readSettingsFile(): Promise<RunpodSettingsFile> {
  try {
    const raw = await readFile(settingsFilePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<RunpodSettingsFile>;
    return {
      settings: normalizeRunpodJobSettings(parsed.settings),
      webhookSecret: typeof parsed.webhookSecret === "string" ? parsed.webhookSecret : ""
    };
  } catch {
    return { settings: { ...DEFAULT_RUNPOD_JOB_SETTINGS }, webhookSecret: "" };
  }
}

async function writeSettingsFile(data: RunpodSettingsFile): Promise<void> {
  await mkdir(getSettingsDir(), { recursive: true });
  const path = settingsFilePath();
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(data, null, 2), "utf8");
  await rename(temporaryPath, path);
}

function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function getRunpodJobSettings(): Promise<RunpodJobSettings> {
  return (await readSettingsFile()).settings;
}

export async function setRunpodJobSettings(next: unknown): Promise<RunpodJobSettings> {
  const settings = normalizeRunpodJobSettings(next);
  await withWriteLock(async () => {
    const current = await readSettingsFile();
    await writeSettingsFile({ ...current, settings });
  });
  return settings;
}

/** Stable per-install secret; the webhook URL is the only thing authenticating callbacks. */
export async function getWebhookSecret(): Promise<string> {
  return withWriteLock(async () => {
    const current = await readSettingsFile();
    if (current.webhookSecret) {
      return current.webhookSecret;
    }

    const webhookSecret = randomUUID().replaceAll("-", "");
    await writeSettingsFile({ ...current, webhookSecret });
    return webhookSecret;
  });
}

export async function matchesWebhookSecret(candidate: string): Promise<boolean> {
  const expected = (await readSettingsFile()).webhookSecret;
  if (!expected || candidate.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}

/**
 * Public origin RunPod can reach. Explicit config wins; otherwise derive the
 * RunPod proxy hostname this server is served from.
 */
export function getPublicBaseUrl(): string | null {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const podId = process.env.RUNPOD_POD_ID?.trim();
  if (!podId) {
    return null;
  }

  const port = Number(process.env.PORT ?? 3000);
  return `https://${podId}-${Number.isFinite(port) ? port : 3000}.proxy.runpod.net`;
}

export async function buildJobWebhookUrl(): Promise<string | null> {
  const baseUrl = getPublicBaseUrl();
  if (!baseUrl) {
    return null;
  }

  return `${baseUrl}/api/webhooks/runpod/${await getWebhookSecret()}`;
}
