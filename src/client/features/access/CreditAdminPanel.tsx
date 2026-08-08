import { useEffect, useState } from "react";
import {
  fetchAdminCredits,
  updateCreditAccount,
  type AdminCreditsDto,
  type CreditAccountDto
} from "../../lib/api/creditsClient";
import "../../styles/credits.css";

type RefreshUnit = "minutes" | "hours" | "days";

const UNIT_MS: Record<RefreshUnit, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000
};

function toRefreshControl(intervalMs: number | undefined): { value: number; unit: RefreshUnit } {
  if (!intervalMs) return { value: 24, unit: "hours" };
  if (intervalMs % UNIT_MS.days === 0) return { value: intervalMs / UNIT_MS.days, unit: "days" };
  if (intervalMs % UNIT_MS.hours === 0) return { value: intervalMs / UNIT_MS.hours, unit: "hours" };
  return { value: Math.max(1, Math.round(intervalMs / UNIT_MS.minutes)), unit: "minutes" };
}

export function CreditAccountEditor({
  users,
  walletGroups,
  initialAccount,
  onSaved
}: {
  users: string[];
  walletGroups: string[];
  initialAccount?: CreditAccountDto;
  onSaved: () => void;
}) {
  const initialRefresh = toRefreshControl(initialAccount?.refreshIntervalMs);
  const [username, setUsername] = useState(initialAccount?.username ?? users[0] ?? "");
  const [walletGroupId, setWalletGroupId] = useState(initialAccount?.walletGroupId ?? walletGroups[0] ?? "default");
  const [allowance, setAllowance] = useState(initialAccount?.allowance ?? 100);
  const [refreshValue, setRefreshValue] = useState(initialRefresh.value);
  const [refreshUnit, setRefreshUnit] = useState<RefreshUnit>(initialRefresh.unit);
  const [refreshingCredits, setRefreshingCredits] = useState(initialAccount?.refreshingCredits ?? 100);
  const [staticCredits, setStaticCredits] = useState(initialAccount?.staticCredits ?? 0);
  const [maxActiveJobs, setMaxActiveJobs] = useState(initialAccount?.maxActiveJobs ?? 1);
  const [status, setStatus] = useState("");

  async function save(): Promise<void> {
    const interval = Math.max(1, refreshValue) * UNIT_MS[refreshUnit];
    setStatus("");
    try {
      await updateCreditAccount({
        username: username.trim(),
        walletGroupId: walletGroupId.trim(),
        allowance,
        refreshIntervalMs: interval,
        refreshingCredits,
        staticCredits,
        maxActiveJobs,
        nextRefreshAt: new Date(Date.now() + interval).toISOString()
      });
      setStatus("Saved");
      onSaved();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed");
    }
  }

  return (
    <div className="credit-editor">
      <label className="field">Username
        <input className="input" list="credit-users" value={username} onChange={(event) => setUsername(event.target.value)} />
        <datalist id="credit-users">{users.map((user) => <option key={user} value={user} />)}</datalist>
      </label>
      <label className="field">Wallet group
        <input className="input" list="credit-wallet-groups" value={walletGroupId} onChange={(event) => setWalletGroupId(event.target.value)} />
        <datalist id="credit-wallet-groups">{walletGroups.map((group) => <option key={group} value={group} />)}</datalist>
      </label>
      <label className="field">Allowance
        <input className="input" type="number" min="0" value={allowance} onChange={(event) => setAllowance(Number(event.target.value))} />
      </label>
      <label className="field">Refresh every
        <span className="credit-interval">
          <input className="input" type="number" min="1" value={refreshValue} onChange={(event) => setRefreshValue(Number(event.target.value))} />
          <select className="select" value={refreshUnit} onChange={(event) => setRefreshUnit(event.target.value as RefreshUnit)}>
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </select>
        </span>
      </label>
      <label className="field">Green balance
        <input className="input" type="number" value={refreshingCredits} onChange={(event) => setRefreshingCredits(Number(event.target.value))} />
      </label>
      <label className="field">Gold balance
        <input className="input" type="number" value={staticCredits} onChange={(event) => setStaticCredits(Number(event.target.value))} />
      </label>
      <label className="field">Concurrent jobs
        <input className="input" type="number" min="1" value={maxActiveJobs} onChange={(event) => setMaxActiveJobs(Number(event.target.value))} />
      </label>
      <div className="credit-editor-action">
        <button className="btn btn-primary" type="button" disabled={!username.trim() || !walletGroupId.trim()} onClick={() => void save()}>Save wallet</button>
        {status ? <span className="status-inline">{status}</span> : null}
      </div>
    </div>
  );
}

export function CreditAdminPanel() {
  const [data, setData] = useState<AdminCreditsDto | null>(null);
  const [error, setError] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<CreditAccountDto | undefined>();

  function load(): void {
    void fetchAdminCredits().then(setData).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Failed to load credits");
    });
  }

  useEffect(load, []);

  const users = [...new Set([...(data?.users ?? []), ...(data?.accounts.map((account) => account.username) ?? []), "anonymous"])].sort();
  const walletGroups = [...new Set(["default", ...Object.values(data?.managedEndpoints ?? {}), ...(data?.accounts.map((account) => account.walletGroupId) ?? [])])].sort();

  return (
    <section className="setup-card">
      <h2>Credits</h2>
      <CreditAccountEditor
        key={selectedAccount ? `${selectedAccount.username}:${selectedAccount.walletGroupId}:${selectedAccount.nextRefreshAt}` : "new"}
        users={users}
        walletGroups={walletGroups}
        initialAccount={selectedAccount}
        onSaved={load}
      />
      {error ? <p className="status-inline">{error}</p> : null}
      <div className="credit-table-wrap">
        <table className="credit-table">
          <thead><tr><th>User</th><th>Wallet</th><th>Green</th><th>Gold</th><th>Allowance</th><th>Jobs</th><th>Next refresh</th><th></th></tr></thead>
          <tbody>{data?.accounts.map((account) => (
            <tr key={`${account.username}:${account.walletGroupId}`}>
              <td>{account.username}</td><td>{account.walletGroupId}</td><td>{account.refreshingCredits}</td><td>{account.staticCredits}</td>
              <td>{account.allowance}</td><td>{account.maxActiveJobs}</td><td>{new Date(account.nextRefreshAt).toLocaleString()}</td>
              <td><button className="btn btn-secondary" type="button" onClick={() => setSelectedAccount(account)}>Edit</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <h3>Ledger</h3>
      <div className="credit-table-wrap">
        <table className="credit-table">
          <thead><tr><th>Settled</th><th>User</th><th>Wallet</th><th>Job</th><th>Credits</th></tr></thead>
          <tbody>{data?.ledger.slice().reverse().map((entry) => (
            <tr key={entry.jobId}><td>{new Date(entry.settledAt).toLocaleString()}</td><td>{entry.username}</td><td>{entry.walletGroupId}</td><td>{entry.jobId.slice(0, 8)}</td><td>{entry.credits}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}