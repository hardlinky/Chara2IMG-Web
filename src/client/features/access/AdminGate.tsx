import { FormEvent, useEffect, useState } from "react";
import { fetchAdminSession, verifyAdminKeyViaProxy } from "../../lib/api/runpodProxyClient";

type AdminGateProps = {
  onGranted: (granted: boolean) => void;
};

function EyeIcon({ visible }: { visible: boolean }) {
  if (visible) {
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
        <path d="M3 3l18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 1.4-.35" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M9.5 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a17.7 17.7 0 0 1-3.7 4.5M6.2 7.2A18.3 18.3 0 0 0 2 12s3.5 7 10 7c1.3 0 2.5-.2 3.5-.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function AdminGate({ onGranted }: AdminGateProps) {
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const session = await fetchAdminSession();
      onGranted(Boolean(session.admin));
      setLoading(false);
    })();
  }, [onGranted]);

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    const result = await verifyAdminKeyViaProxy(key);
    setSubmitting(false);

    if (!result.ok || !result.admin) {
      onGranted(false);
      setError("Admin key is invalid.");
      return;
    }

    onGranted(true);
    setKey("");
  }

  if (loading) {
    return (
      <section className="setup-card">
        <p>Checking admin access...</p>
      </section>
    );
  }

  return (
    <section className="setup-card">
      <h2>Admin Access</h2>
      <p>Enter the server admin key shown in backend logs to unlock admin tools.</p>

      <form className="setup-form" onSubmit={(event) => void onSubmit(event)}>
        <label className="field" htmlFor="admin-key">
          Admin key
          <span className="password-input-wrap">
            <input
              className="input"
              id="admin-key"
              name="admin-key"
              type={showKey ? "text" : "password"}
              autoComplete="off"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              required
            />
            <button
              className="password-visibility-toggle"
              type="button"
              aria-label={showKey ? "Hide password" : "Show password"}
              title={showKey ? "Hide password" : "Show password"}
              onClick={() => setShowKey((current) => !current)}
            >
              <EyeIcon visible={showKey} />
            </button>
          </span>
        </label>

        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Verifying..." : "Unlock Admin"}
        </button>
      </form>

      {error ? (
        <p role="alert" className="status-inline" data-tone="error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
