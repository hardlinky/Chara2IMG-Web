import { describe, expect, it } from "vitest";
import {
  applyCreditCharge,
  calculateExecutionCredits,
  calculateJobCredits,
  refreshCreditBalances
} from "../../src/shared/credits";

describe("credit billing", () => {
  it("charges one credit for each started ten-second interval", () => {
    expect(calculateExecutionCredits(0)).toBe(1);
    expect(calculateExecutionCredits(10_000)).toBe(1);
    expect(calculateExecutionCredits(10_001)).toBe(2);
    expect(calculateExecutionCredits(30_001)).toBe(4);
    expect(calculateExecutionCredits(40_001)).toBe(5);
  });

  it("does not charge a queued cancellation", () => {
    expect(calculateJobCredits({ status: "CANCELLED", startedAt: null, executionTimeMs: 50_000 })).toBe(0);
  });

  it("charges terminal jobs that entered execution", () => {
    expect(calculateJobCredits({ status: "COMPLETED", startedAt: "2026-08-08T00:00:00.000Z", executionTimeMs: 40_001 })).toBe(5);
    expect(calculateJobCredits({ status: "FAILED", startedAt: "2026-08-08T00:00:00.000Z", executionTimeMs: 20_000 })).toBe(2);
    expect(calculateJobCredits({ status: "CANCELLED", startedAt: "2026-08-08T00:00:00.000Z", executionTimeMs: 11_000 })).toBe(2);
  });

  it("spends refreshing credits before the static wallet and permits debt", () => {
    expect(applyCreditCharge({ refreshingCredits: 3, staticCredits: 2 }, 7)).toEqual({
      refreshingCredits: 0,
      staticCredits: -2
    });
  });

  it("uses the next refresh allowance to repay static debt first", () => {
    expect(refreshCreditBalances({ refreshingCredits: 20, staticCredits: -30 }, 100)).toEqual({
      refreshingCredits: 70,
      staticCredits: 0
    });
    expect(refreshCreditBalances({ refreshingCredits: 0, staticCredits: -130 }, 100)).toEqual({
      refreshingCredits: 0,
      staticCredits: -30
    });
  });

  it("resets refreshing credits without changing a positive static wallet", () => {
    expect(refreshCreditBalances({ refreshingCredits: 12, staticCredits: 8 }, 100)).toEqual({
      refreshingCredits: 100,
      staticCredits: 8
    });
  });
});