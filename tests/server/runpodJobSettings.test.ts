import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

type SettingsModule = typeof import("../../src/server/lib/runpodSettingsStore");

let settingsStore: SettingsModule;
let settingsDir: string;

beforeEach(async () => {
  settingsDir = await mkdtemp(join(tmpdir(), "runpod-settings-"));
  process.env.RUNPOD_SETTINGS_DIR = settingsDir;

  vi.resetModules();
  settingsStore = await import("../../src/server/lib/runpodSettingsStore");
});

afterEach(async () => {
  delete process.env.RUNPOD_SETTINGS_DIR;
  delete process.env.PUBLIC_BASE_URL;
  delete process.env.RUNPOD_POD_ID;
  await rm(settingsDir, { recursive: true, force: true });
});

describe("runpod job settings store", () => {
  it("defaults to the endpoint configuration until an admin changes it", async () => {
    expect(await settingsStore.getRunpodJobSettings()).toEqual({
      useWebhook: false,
      executionTimeoutSeconds: 0
    });
  });

  it("persists settings and snaps the timeout to whole minutes", async () => {
    await settingsStore.setRunpodJobSettings({ useWebhook: true, executionTimeoutSeconds: 605 });

    vi.resetModules();
    const reloaded = await import("../../src/server/lib/runpodSettingsStore");

    expect(await reloaded.getRunpodJobSettings()).toEqual({
      useWebhook: true,
      executionTimeoutSeconds: 600
    });
  });

  it("treats a non-positive timeout as the endpoint default", async () => {
    const settings = await settingsStore.setRunpodJobSettings({ useWebhook: false, executionTimeoutSeconds: -30 });

    expect(settings.executionTimeoutSeconds).toBe(0);
  });

  it("reuses one webhook secret and rejects anything else", async () => {
    const secret = await settingsStore.getWebhookSecret();

    expect(await settingsStore.getWebhookSecret()).toBe(secret);
    expect(await settingsStore.matchesWebhookSecret(secret)).toBe(true);
    expect(await settingsStore.matchesWebhookSecret("nope")).toBe(false);
    expect(await settingsStore.matchesWebhookSecret("x".repeat(secret.length))).toBe(false);
  });

  it("keeps the webhook secret when settings are updated", async () => {
    const secret = await settingsStore.getWebhookSecret();
    await settingsStore.setRunpodJobSettings({ useWebhook: true, executionTimeoutSeconds: 120 });

    expect(await settingsStore.getWebhookSecret()).toBe(secret);
  });

  it("derives the callback URL from the RunPod proxy hostname", async () => {
    process.env.RUNPOD_POD_ID = "pod-abc";
    process.env.PORT = "3000";

    expect(settingsStore.getPublicBaseUrl()).toBe("https://pod-abc-3000.proxy.runpod.net");
    expect(await settingsStore.buildJobWebhookUrl()).toMatch(
      /^https:\/\/pod-abc-3000\.proxy\.runpod\.net\/api\/webhooks\/runpod\/[0-9a-f]+$/
    );
  });

  it("prefers an explicit public base URL and drops its trailing slash", async () => {
    process.env.RUNPOD_POD_ID = "pod-abc";
    process.env.PUBLIC_BASE_URL = "https://images.example.com/";

    expect(settingsStore.getPublicBaseUrl()).toBe("https://images.example.com");
  });

  it("reports no callback URL when the server is not publicly reachable", async () => {
    delete process.env.RUNPOD_POD_ID;

    expect(settingsStore.getPublicBaseUrl()).toBeNull();
    expect(await settingsStore.buildJobWebhookUrl()).toBeNull();
  });
});
