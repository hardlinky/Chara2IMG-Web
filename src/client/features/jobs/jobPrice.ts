import { calculateExecutionCredits } from "../../../shared/credits";
import type { RecentJobRecord } from "../../../shared/contracts/jobs";

export type JobPrice =
  | { state: "final"; refreshingCredits: number; staticCredits: number }
  | { state: "current"; refreshingCredits: number; staticCredits: number };

export function formatJobPrice(job: RecentJobRecord, now: number, availableRefreshingCredits?: number): JobPrice | null {
  if (job.billingMode !== "managed") {
    return null;
  }
  if (typeof job.creditsCharged === "number") {
    return {
      state: "final",
      refreshingCredits: job.refreshingCreditsCharged ?? job.creditsCharged,
      staticCredits: job.staticCreditsCharged ?? 0
    };
  }
  if (!job.lifecycle.isTerminal && job.lifecycle.status === "IN_PROGRESS" && job.lifecycle.startedAt) {
    const startedAt = Date.parse(job.lifecycle.startedAt);
    if (Number.isFinite(startedAt)) {
      const estimatedCredits = calculateExecutionCredits(Math.max(0, now - startedAt));
      const available = Number.isFinite(availableRefreshingCredits)
        ? Math.max(0, availableRefreshingCredits ?? 0)
        : estimatedCredits;
      const refreshingCredits = Math.min(available, estimatedCredits);
      return {
        state: "current",
        refreshingCredits,
        staticCredits: estimatedCredits - refreshingCredits
      };
    }
  }
  return null;
}