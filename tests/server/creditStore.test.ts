import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("credit store", () => {
  let creditsDir: string;

  beforeEach(async () => {
    creditsDir = await mkdtemp(join(tmpdir(), "credit-store-"));
    process.env.CREDITS_DIR = creditsDir;
    process.env.RUNPOD_ENDPOINT_ID = "managed-default";
    process.env.MANAGED_ENDPOINT_WALLETS = JSON.stringify({
      "managed-a": "shared",
      "managed-b": "shared"
    });
    vi.resetModules();
  });

  afterEach(async () => {
    delete process.env.CREDITS_DIR;
    delete process.env.RUNPOD_ENDPOINT_ID;
    delete process.env.MANAGED_ENDPOINT_WALLETS;
    await rm(creditsDir, { recursive: true, force: true });
  });

  it("treats unknown endpoints as unlimited implied wallets", async () => {
    const { getCreditBalance } = await import("../../src/server/lib/creditStore");

    expect(await getCreditBalance("artist", "unknown-endpoint")).toEqual({
      managed: false,
      walletGroupId: null,
      unlimited: true
    });
  });

  it("shares a configured wallet across managed endpoints", async () => {
    const { configureCreditAccount, getCreditBalance } = await import("../../src/server/lib/creditStore");
    await configureCreditAccount({
      username: "artist",
      walletGroupId: "shared",
      allowance: 100,
      refreshIntervalMs: 3_600_000,
      refreshingCredits: 60,
      staticCredits: 10,
      maxActiveJobs: 2,
      nextRefreshAt: "2026-08-08T02:00:00.000Z"
    });

    const first = await getCreditBalance("artist", "managed-a", Date.parse("2026-08-08T01:00:00.000Z"));
    const second = await getCreditBalance("artist", "managed-b", Date.parse("2026-08-08T01:00:00.000Z"));

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      managed: true,
      walletGroupId: "shared",
      refreshingCredits: 60,
      staticCredits: 10,
      totalCredits: 70,
      maxActiveJobs: 2
    });
  });

  it("repays static debt from every elapsed refresh allowance", async () => {
    const { configureCreditAccount, getCreditBalance } = await import("../../src/server/lib/creditStore");
    await configureCreditAccount({
      username: "artist",
      walletGroupId: "shared",
      allowance: 100,
      refreshIntervalMs: 3_600_000,
      refreshingCredits: 0,
      staticCredits: -130,
      maxActiveJobs: 1,
      nextRefreshAt: "2026-08-08T01:00:00.000Z"
    });

    const balance = await getCreditBalance("artist", "managed-a", Date.parse("2026-08-08T02:30:00.000Z"));

    expect(balance).toMatchObject({
      refreshingCredits: 70,
      staticCredits: 0,
      totalCredits: 70,
      nextRefreshAt: "2026-08-08T03:00:00.000Z"
    });
  });

  it("settles a job exactly once and spends refreshing credits first", async () => {
    const { configureCreditAccount, getCreditBalance, settleManagedJobCredits } = await import("../../src/server/lib/creditStore");
    await configureCreditAccount({
      username: "artist",
      walletGroupId: "shared",
      allowance: 3,
      refreshIntervalMs: 86_400_000,
      refreshingCredits: 3,
      staticCredits: 2,
      maxActiveJobs: 1,
      nextRefreshAt: "2026-08-09T00:00:00.000Z"
    });

    const first = await settleManagedJobCredits({
      jobId: "job-1",
      username: "artist",
      walletGroupId: "shared",
      credits: 7,
      settledAt: "2026-08-08T00:00:00.000Z"
    });
    const duplicate = await settleManagedJobCredits({
      jobId: "job-1",
      username: "artist",
      walletGroupId: "shared",
      credits: 7,
      settledAt: "2026-08-08T00:00:01.000Z"
    });

    expect(first.alreadySettled).toBe(false);
    expect(duplicate.alreadySettled).toBe(true);
    expect(await getCreditBalance("artist", "managed-a", Date.parse("2026-08-08T00:00:02.000Z"))).toMatchObject({
      refreshingCredits: 0,
      staticCredits: -2,
      totalCredits: -2
    });
  });
});