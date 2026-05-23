import { FormEvent, useEffect, useState } from "react";

type InviteGateProps = {
  onInvited: () => void;
};

type SessionResponse = {
  ok: boolean;
  invited: boolean;
};

export function InviteGate(props: InviteGateProps) {
  const [invite, setInvite] = useState("");
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
    return <p>Checking access...</p>;
  }

  return (
    <section>
      <h1>Invited Access</h1>
      <p>Enter your invite code to unlock this app.</p>

      <form onSubmit={(event) => void submitInvite(event)}>
        <label htmlFor="invite">Invite code</label>
        <input
          id="invite"
          name="invite"
          type="password"
          value={invite}
          onChange={(event) => setInvite(event.target.value)}
          autoComplete="off"
          required
        />

        <button type="submit" disabled={submitting}>
          {submitting ? "Verifying..." : "Verify Invite"}
        </button>
      </form>

      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
