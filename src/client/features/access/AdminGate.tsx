import { FormEvent, useEffect, useState } from "react";
import { fetchAdminSession, verifyAdminKeyViaProxy } from "../../lib/api/runpodProxyClient";

type AdminGateProps = {
  onGranted: (granted: boolean) => void;
};

export function AdminGate({ onGranted }: AdminGateProps) {
  const [key, setKey] = useState("");
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
          <input
            className="input"
            id="admin-key"
            name="admin-key"
            type="password"
            autoComplete="off"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            required
          />
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
