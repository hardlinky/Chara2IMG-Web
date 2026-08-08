import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("submission capacity", () => {
  beforeEach(() => {
    process.env.RUNPOD_GLOBAL_CONCURRENCY = "2";
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.RUNPOD_GLOBAL_CONCURRENCY;
  });

  it("reserves no more than the global polling capacity", async () => {
    const { reserveSubmissionCapacity } = await import("../../src/server/lib/submissionCapacity");

    expect(reserveSubmissionCapacity({ username: "a", walletGroupId: null, maxWalletActiveJobs: null }).ok).toBe(true);
    expect(reserveSubmissionCapacity({ username: "b", walletGroupId: null, maxWalletActiveJobs: null }).ok).toBe(true);
    expect(reserveSubmissionCapacity({ username: "c", walletGroupId: null, maxWalletActiveJobs: null })).toEqual({
      ok: false,
      reason: "global-capacity"
    });
  });

  it("applies wallet capacity across endpoints sharing a wallet group", async () => {
    const { reserveSubmissionCapacity } = await import("../../src/server/lib/submissionCapacity");

    const first = reserveSubmissionCapacity({ username: "artist", walletGroupId: "shared", maxWalletActiveJobs: 1 });
    expect(first.ok).toBe(true);
    expect(reserveSubmissionCapacity({ username: "artist", walletGroupId: "shared", maxWalletActiveJobs: 1 })).toEqual({
      ok: false,
      reason: "wallet-capacity"
    });
    expect(reserveSubmissionCapacity({ username: "other", walletGroupId: "shared", maxWalletActiveJobs: 1 }).ok).toBe(true);
  });

  it("releases failed submissions and terminal jobs", async () => {
    const { releaseSubmissionCapacity, reserveSubmissionCapacity } = await import("../../src/server/lib/submissionCapacity");

    const first = reserveSubmissionCapacity({ username: "artist", walletGroupId: "shared", maxWalletActiveJobs: 1 });
    if (!first.ok) throw new Error("Expected reservation");
    releaseSubmissionCapacity(first.reservationId);

    expect(reserveSubmissionCapacity({ username: "artist", walletGroupId: "shared", maxWalletActiveJobs: 1 }).ok).toBe(true);
  });

  it("does not apply wallet capacity to unknown endpoints", async () => {
    const { reserveSubmissionCapacity } = await import("../../src/server/lib/submissionCapacity");

    expect(reserveSubmissionCapacity({ username: "artist", walletGroupId: null, maxWalletActiveJobs: null }).ok).toBe(true);
    expect(reserveSubmissionCapacity({ username: "artist", walletGroupId: null, maxWalletActiveJobs: null }).ok).toBe(true);
  });
});