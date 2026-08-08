import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyCreditCharge, refreshCreditBalances } from "../../shared/credits";

export type CreditAccount = {
  username: string;
  walletGroupId: string;
  allowance: number;
  refreshIntervalMs: number;
  refreshingCredits: number;
  staticCredits: number;
  maxActiveJobs: number;
  nextRefreshAt: string;
};

export type CreditLedgerEntry = {
  jobId: string;
  username: string;
  walletGroupId: string;
  credits: number;
  refreshingCreditsCharged?: number;
  staticCreditsCharged?: number;
  settledAt: string;
};

type CreditStoreData = {
  accounts: CreditAccount[];
  ledger: CreditLedgerEntry[];
};

export type ManagedCreditBalance = CreditAccount & {
  managed: true;
  unlimited: false;
  totalCredits: number;
};

export type UnlimitedCreditBalance = {
  managed: false;
  walletGroupId: null;
  unlimited: true;
};

const EMPTY_STORE: CreditStoreData = { accounts: [], ledger: [] };
let writeChain: Promise<void> = Promise.resolve();

function getCreditsDir(): string {
  return process.env.CREDITS_DIR?.trim() || join(process.cwd(), "..", "chara2img", "credits");
}

function getManagedEndpointWallets(): Map<string, string> {
  const result = new Map<string, string>();
  const defaultEndpointId = process.env.RUNPOD_ENDPOINT_ID?.trim();
  if (defaultEndpointId) {
    result.set(defaultEndpointId, "default");
  }

  try {
    const configured = JSON.parse(process.env.MANAGED_ENDPOINT_WALLETS || "{}") as unknown;
    if (configured && typeof configured === "object" && !Array.isArray(configured)) {
      for (const [endpointId, walletGroupId] of Object.entries(configured)) {
        if (endpointId.trim() && typeof walletGroupId === "string" && walletGroupId.trim()) {
          result.set(endpointId.trim(), walletGroupId.trim());
        }
      }
    }
  } catch {
    // Invalid optional configuration leaves only the default managed endpoint.
  }
  return result;
}

export function getManagedWalletGroupId(endpointId: string): string | null {
  return getManagedEndpointWallets().get(endpointId) ?? null;
}

async function readStore(): Promise<CreditStoreData> {
  try {
    const content = await readFile(join(getCreditsDir(), "credits.json"), "utf8");
    const parsed = JSON.parse(content) as Partial<CreditStoreData>;
    return {
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      ledger: Array.isArray(parsed.ledger) ? parsed.ledger : []
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return structuredClone(EMPTY_STORE);
    }
    throw error;
  }
}

async function writeStore(data: CreditStoreData): Promise<void> {
  const directory = getCreditsDir();
  const target = join(directory, "credits.json");
  const temporary = join(directory, `credits-${process.pid}-${Date.now()}.tmp`);
  await mkdir(directory, { recursive: true });
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

async function withMutation<T>(mutate: (data: CreditStoreData) => Promise<T> | T): Promise<T> {
  let resolveResult!: (value: T) => void;
  let rejectResult!: (reason: unknown) => void;
  const result = new Promise<T>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  writeChain = writeChain.then(async () => {
    try {
      const data = await readStore();
      const value = await mutate(data);
      await writeStore(data);
      resolveResult(value);
    } catch (error) {
      rejectResult(error);
    }
  });
  return result;
}

function refreshAccount(account: CreditAccount, nowMs: number): void {
  let nextRefreshMs = Date.parse(account.nextRefreshAt);
  if (!Number.isFinite(nextRefreshMs) || account.refreshIntervalMs <= 0) {
    return;
  }

  while (nextRefreshMs <= nowMs) {
    const refreshed = refreshCreditBalances(account, account.allowance);
    account.refreshingCredits = refreshed.refreshingCredits;
    account.staticCredits = refreshed.staticCredits;
    nextRefreshMs += account.refreshIntervalMs;
  }
  account.nextRefreshAt = new Date(nextRefreshMs).toISOString();
}

export async function configureCreditAccount(account: CreditAccount): Promise<void> {
  await withMutation((data) => {
    const index = data.accounts.findIndex(
      (candidate) => candidate.username === account.username && candidate.walletGroupId === account.walletGroupId
    );
    if (index >= 0) {
      data.accounts[index] = { ...account };
    } else {
      data.accounts.push({ ...account });
    }
  });
}

export async function getCreditBalance(
  username: string,
  endpointId: string,
  nowMs = Date.now()
): Promise<ManagedCreditBalance | UnlimitedCreditBalance> {
  const walletGroupId = getManagedWalletGroupId(endpointId);
  if (!walletGroupId) {
    return { managed: false, walletGroupId: null, unlimited: true };
  }

  return withMutation((data) => {
    let account = data.accounts.find(
      (candidate) => candidate.username === username && candidate.walletGroupId === walletGroupId
    );
    if (!account) {
      account = {
        username,
        walletGroupId,
        allowance: 0,
        refreshIntervalMs: 86_400_000,
        refreshingCredits: 0,
        staticCredits: 0,
        maxActiveJobs: 1,
        nextRefreshAt: new Date(nowMs + 86_400_000).toISOString()
      };
      data.accounts.push(account);
    }
    refreshAccount(account, nowMs);
    return {
      ...account,
      managed: true as const,
      unlimited: false as const,
      totalCredits: account.refreshingCredits + account.staticCredits
    };
  });
}

export async function getCreditAccount(username: string, walletGroupId: string): Promise<CreditAccount | null> {
  const data = await readStore();
  const account = data.accounts.find(
    (candidate) => candidate.username === username && candidate.walletGroupId === walletGroupId
  );
  return account ? { ...account } : null;
}

export async function settleManagedJobCredits(input: CreditLedgerEntry): Promise<{
  alreadySettled: boolean;
  credits: number;
  refreshingCreditsCharged?: number;
  staticCreditsCharged?: number;
  settledAt: string;
}> {
  return withMutation((data) => {
    const existing = data.ledger.find((entry) => entry.jobId === input.jobId);
    if (existing) {
      return {
        alreadySettled: true,
        credits: existing.credits,
        refreshingCreditsCharged: existing.refreshingCreditsCharged,
        staticCreditsCharged: existing.staticCreditsCharged,
        settledAt: existing.settledAt
      };
    }
    const account = data.accounts.find(
      (candidate) => candidate.username === input.username && candidate.walletGroupId === input.walletGroupId
    );
    if (!account) {
      throw new Error(`Credit account not found for ${input.username}/${input.walletGroupId}`);
    }
    const updated = applyCreditCharge(account, input.credits);
    account.refreshingCredits = updated.refreshingCredits;
    account.staticCredits = updated.staticCredits;
    const entry = {
      ...input,
      refreshingCreditsCharged: updated.refreshingCreditsCharged,
      staticCreditsCharged: updated.staticCreditsCharged
    };
    data.ledger.push(entry);
    return {
      alreadySettled: false,
      credits: input.credits,
      refreshingCreditsCharged: entry.refreshingCreditsCharged,
      staticCreditsCharged: entry.staticCreditsCharged,
      settledAt: input.settledAt
    };
  });
}

export function listManagedEndpointWallets(): Record<string, string> {
  return Object.fromEntries(getManagedEndpointWallets());
}

export async function listCreditAccounts(): Promise<CreditAccount[]> {
  const data = await readStore();
  return data.accounts.map((account) => ({ ...account }));
}

export async function listCreditLedger(): Promise<CreditLedgerEntry[]> {
  const data = await readStore();
  return data.ledger.map((entry) => ({ ...entry }));
}