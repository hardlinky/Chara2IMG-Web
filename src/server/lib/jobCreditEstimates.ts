import { calculateExecutionCredits } from "../../shared/credits";
import { getRefreshedCreditAccount } from "./creditStore";
import { listJobs, updateJob } from "./jobStore";

let estimateChain: Promise<void> = Promise.resolve();

export async function refreshManagedJobCreditEstimates(
  username: string,
  walletGroupId: string,
  _endpointId: string,
  nowMs = Date.now()
): Promise<void> {
  const run = estimateChain.then(async () => {
    const account = await getRefreshedCreditAccount(username, walletGroupId, nowMs);
    if (!account) return;

    const jobs = (await listJobs())
      .filter((job) => (
        job.billingMode === "managed"
        && job.billingUsername === username
        && job.walletGroupId === walletGroupId
        && !job.isTerminal
        && job.status === "IN_PROGRESS"
        && Boolean(job.startedAt)
      ))
      .sort((left, right) => (
        Date.parse(left.submittedAt) - Date.parse(right.submittedAt)
        || left.jobId.localeCompare(right.jobId)
      ));

    let availableRefreshingCredits = Math.max(0, account.refreshingCredits);
    const creditEstimateUpdatedAt = new Date(nowMs).toISOString();

    for (const job of jobs) {
      const startedAtMs = Date.parse(job.startedAt ?? "");
      if (!Number.isFinite(startedAtMs)) continue;

      const estimatedCredits = calculateExecutionCredits(Math.max(0, nowMs - startedAtMs));
      const estimatedRefreshingCredits = Math.min(availableRefreshingCredits, estimatedCredits);
      const estimatedStaticCredits = estimatedCredits - estimatedRefreshingCredits;
      availableRefreshingCredits -= estimatedRefreshingCredits;

      await updateJob(job.jobId, {
        estimatedCredits,
        estimatedRefreshingCredits,
        estimatedStaticCredits,
        creditEstimateUpdatedAt
      });
    }
  });

  estimateChain = run.catch(() => undefined);
  await run;
}

export async function refreshJobWalletCreditEstimates(job: {
  billingMode?: "managed" | "free";
  billingUsername?: string;
  walletGroupId?: string | null;
  endpointId: string;
}, nowMs = Date.now()): Promise<void> {
  if (job.billingMode !== "managed" || !job.billingUsername || !job.walletGroupId) return;
  await refreshManagedJobCreditEstimates(job.billingUsername, job.walletGroupId, job.endpointId, nowMs);
}