import { calculateJobCredits } from "../../shared/credits";
import type { JobRecord, JobStatus } from "../../shared/contracts/jobs";
import { settleManagedJobCredits } from "./creditStore";

export type JobBillingSettlement = {
  alreadySettled: boolean;
  creditsCharged: number;
  refreshingCreditsCharged?: number;
  staticCreditsCharged?: number;
  executionTimeMs: number;
  creditSettledAt: string;
};

export async function settleTerminalJobBilling(
  job: JobRecord,
  status: JobStatus,
  terminalAt: string,
  reportedExecutionTimeMs?: number
): Promise<JobBillingSettlement | null> {
  const billingUsername = job.billingUsername ?? job.createdBy;
  if (job.billingMode !== "managed" || !job.walletGroupId || !billingUsername) {
    return null;
  }

  const startedMs = job.startedAt ? Date.parse(job.startedAt) : Number.NaN;
  const terminalMs = Date.parse(terminalAt);
  const elapsedMs = Number.isFinite(startedMs) && Number.isFinite(terminalMs)
    ? Math.max(0, terminalMs - startedMs)
    : 0;
  const executionTimeMs = Number.isFinite(reportedExecutionTimeMs)
    ? Math.max(0, reportedExecutionTimeMs ?? 0)
    : elapsedMs;
  const credits = calculateJobCredits({
    status,
    startedAt: job.startedAt,
    executionTimeMs
  });
  const settlement = await settleManagedJobCredits({
    jobId: job.jobId,
    username: billingUsername,
    walletGroupId: job.walletGroupId,
    credits,
    settledAt: terminalAt
  });

  return {
    alreadySettled: settlement.alreadySettled,
    creditsCharged: settlement.credits,
    refreshingCreditsCharged: settlement.refreshingCreditsCharged,
    staticCreditsCharged: settlement.staticCreditsCharged,
    executionTimeMs,
    creditSettledAt: settlement.settledAt
  };
}