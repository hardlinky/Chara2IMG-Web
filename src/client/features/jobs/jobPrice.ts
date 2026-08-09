import type { RecentJobRecord } from "../../../shared/contracts/jobs";

export type JobPrice =
  | { state: "final"; refreshingCredits: number; staticCredits: number }
  | { state: "current"; refreshingCredits: number; staticCredits: number };

export function formatJobPrice(job: RecentJobRecord): JobPrice | null {
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
  if (
    !job.lifecycle.isTerminal
    && typeof job.estimatedRefreshingCredits === "number"
    && typeof job.estimatedStaticCredits === "number"
  ) {
    return {
      state: "current",
      refreshingCredits: job.estimatedRefreshingCredits,
      staticCredits: job.estimatedStaticCredits
    };
  }
  return null;
}