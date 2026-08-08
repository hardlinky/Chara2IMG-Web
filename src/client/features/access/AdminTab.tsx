import { useState } from "react";
import { impersonateUser } from "../../lib/api/usersClient";
import { ModelDownloadsPanel } from "./ModelDownloadsPanel";
import { WorkflowUploadsPanel } from "./WorkflowUploadsPanel";
import { CreditAdminPanel } from "./CreditAdminPanel";

type AdminTabProps = {
  enabled: boolean;
  onImpersonated: (username: string) => void;
};

export function AdminTab({ enabled, onImpersonated }: AdminTabProps) {
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  if (!enabled) {
    return null;
  }

  async function handleImpersonate(): Promise<void> {
    const name = username.trim();
    if (name.length === 0) {
      setStatus("Enter a username.");
      return;
    }
    setIsBusy(true);
    setStatus("");
    try {
      const result = await impersonateUser(name);
      if (result.ok) {
        onImpersonated(result.username);
        setStatus(`Now acting as "${result.username}".`);
        setUsername("");
      } else {
        setStatus(result.error);
      }
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="section-stack">
      <section className="setup-card">
        <h2>Impersonate User</h2>
        <p>Act as an existing user. Their jobs, outputs, and albums are shown as if you were them. Use Logout above to stop.</p>
        <div className="field">
          <label htmlFor="admin-impersonate-name">Username</label>
          <input
            className="input"
            id="admin-impersonate-name"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="off"
          />
        </div>
        <button className="btn btn-primary" type="button" onClick={() => void handleImpersonate()} disabled={isBusy}>
          {isBusy ? "Please wait..." : "Impersonate"}
        </button>
        {status ? <p className="status-inline">{status}</p> : null}
      </section>

      <CreditAdminPanel />
      <WorkflowUploadsPanel />
      <ModelDownloadsPanel enabled={enabled} />
    </div>
  );
}

