import { FormEvent, useEffect, useState } from "react";

type InviteGateProps = {
  onInvited: () => void;
};

type SessionResponse = {
  ok: boolean;
  invited: boolean;
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

export function InviteGate(props: InviteGateProps) {
  const [invite, setInvite] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadSession();
  }, []);

  async function loadSession(): Promise<void> {
    setLoading(true);

    const response = await fetch("/api/access/session", {
      method: "GET",
      credentials: "include"
    });

    if (!response.ok) {
      setError("Unable to verify invited session.");
      setLoading(false);
      return;
    }

    const payload = (await response.json()) as SessionResponse;

    if (payload.invited) {
      props.onInvited();
      return;
    }

    setLoading(false);
  }

  async function submitInvite(event: FormEvent): Promise<void> {
    event.preventDefault();

    setSubmitting(true);
    setError("");

    const response = await fetch("/api/access/verify-invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({ invite })
    });

    setSubmitting(false);

    if (!response.ok) {
      setError("Invite is invalid.");
      return;
    }

    props.onInvited();
  }

  if (loading) {
    return (
      <section className="setup-card">
        <p>Checking access...</p>
      </section>
    );
  }

  return (
    <section className="setup-card">
      <h1>Invited Access</h1>
      <p>Enter your invite code to unlock this app.</p>

      <form className="setup-form" onSubmit={(event) => void submitInvite(event)}>
        <label className="field" htmlFor="invite">
          Invite code
          <span className="password-input-wrap">
            <input
              className="input"
              id="invite"
              name="invite"
              type={showInvite ? "text" : "password"}
              value={invite}
              onChange={(event) => setInvite(event.target.value)}
              autoComplete="off"
              required
            />
            <button
              className="password-visibility-toggle"
              type="button"
              aria-label={showInvite ? "Hide password" : "Show password"}
              title={showInvite ? "Hide password" : "Show password"}
              onClick={() => setShowInvite((current) => !current)}
            >
              <EyeIcon visible={showInvite} />
            </button>
          </span>
        </label>

        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Verifying..." : "Verify Invite"}
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
