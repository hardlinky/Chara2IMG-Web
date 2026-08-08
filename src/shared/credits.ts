export type CreditBalances = {
  refreshingCredits: number;
  staticCredits: number;
};

export const ANONYMOUS_CREDIT_USERNAME = "anonymous";

export function isReservedAnonymousUsername(username: string): boolean {
  return /^(anon|anonymous)$/i.test(username.trim());
}

export type CreditPricedJob = {
  status: string;
  startedAt: string | null | undefined;
  executionTimeMs: number;
};

export function calculateExecutionCredits(executionTimeMs: number): number {
  const normalizedMs = Number.isFinite(executionTimeMs) ? Math.max(0, executionTimeMs) : 0;
  return Math.max(1, Math.ceil(normalizedMs / 10_000));
}

export function calculateJobCredits(job: CreditPricedJob): number {
  if (job.status === "CANCELLED" && !job.startedAt) {
    return 0;
  }
  return calculateExecutionCredits(job.executionTimeMs);
}

export function applyCreditCharge(balances: CreditBalances, credits: number): CreditBalances {
  const charge = Number.isFinite(credits) ? Math.max(0, Math.ceil(credits)) : 0;
  const refreshingSpend = Math.min(Math.max(0, balances.refreshingCredits), charge);
  return {
    refreshingCredits: balances.refreshingCredits - refreshingSpend,
    staticCredits: balances.staticCredits - (charge - refreshingSpend)
  };
}

export function refreshCreditBalances(balances: CreditBalances, allowance: number): CreditBalances {
  const availableAllowance = Number.isFinite(allowance) ? Math.max(0, Math.floor(allowance)) : 0;
  const debt = Math.max(0, -balances.staticCredits);
  const debtPayment = Math.min(availableAllowance, debt);
  return {
    refreshingCredits: availableAllowance - debtPayment,
    staticCredits: balances.staticCredits + debtPayment
  };
}