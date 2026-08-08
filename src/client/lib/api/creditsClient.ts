import type { CreditBalanceView } from "../../features/access/CreditBalanceDisplay";

export type CreditAccountDto = {
  username: string;
  walletGroupId: string;
  allowance: number;
  refreshIntervalMs: number;
  refreshingCredits: number;
  staticCredits: number;
  maxActiveJobs: number;
  nextRefreshAt: string;
};

export type CreditLedgerEntryDto = {
  jobId: string;
  username: string;
  walletGroupId: string;
  credits: number;
  settledAt: string;
};

export type AdminCreditsDto = {
  users: string[];
  accounts: CreditAccountDto[];
  ledger: CreditLedgerEntryDto[];
  managedEndpoints: Record<string, string>;
};

export async function fetchCreditBalance(endpointId: string): Promise<CreditBalanceView> {
  const response = await fetch(`/api/users/credits?endpointId=${encodeURIComponent(endpointId)}`, { credentials: "include" });
  if (!response.ok) throw new Error(`Failed to load credits: ${response.status}`);
  return await response.json() as CreditBalanceView;
}

export async function fetchAdminCredits(): Promise<AdminCreditsDto> {
  const response = await fetch("/api/admin/credits", { credentials: "include" });
  if (!response.ok) throw new Error(`Failed to load credit administration: ${response.status}`);
  return await response.json() as AdminCreditsDto;
}

export async function updateCreditAccount(account: CreditAccountDto): Promise<void> {
  const response = await fetch("/api/admin/credits/accounts", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(account)
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(data?.error ?? `Failed to save credit account: ${response.status}`);
  }
}