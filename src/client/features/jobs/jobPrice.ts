import { calculateExecutionCredits } from "../../../shared/credits";
import type { RecentJobRecord } from "../../../shared/contracts/jobs";

function creditsLabel(credits: number): string {
  return `${credits} ${credits === 1 ? "credit" : "credits"}`;
}

export function formatJobPrice(job: RecentJobRecord, now: number): string | null {
  if (job.billingMode === "free") {
    return "Free";
  }
  if (job.billingMode !== "managed") {
    return null;
  }
  if (typeof job.creditsCharged === "number") {
    return creditsLabel(job.creditsCharged);
  }
  if (!job.lifecycle.isTerminal && job.lifecycle.status === "IN_PROGRESS" && job.lifecycle.startedAt) {
    const startedAt = Date.parse(job.lifecycle.startedAt);
    if (Number.isFinite(startedAt)) {
      return `${creditsLabel(calculateExecutionCredits(Math.max(0, now - startedAt)))} current`;
    }
  }
  return "Pending";
}