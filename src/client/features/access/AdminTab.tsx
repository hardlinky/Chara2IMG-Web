import { useEffect, useState } from "react";
import { impersonateUser } from "../../lib/api/usersClient";
import { ModelDownloadsPanel } from "./ModelDownloadsPanel";
import { WorkflowUploadsPanel } from "./WorkflowUploadsPanel";
import { CreditAdminPanel } from "./CreditAdminPanel";

const JOB_COMPLETION_NOTIFICATION_STORAGE_KEY = "chara2imgJobCompletionNotifications";

function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const contentId = `admin-section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <section className="setup-card">
      <button
        type="button"
        className="btn btn-secondary"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setIsOpen((current) => !current)}
        style={{ width: "100%", justifyContent: "space-between", textAlign: "left" }}
      >
        <span>{title}</span>
        <span aria-hidden="true">{isOpen ? "−" : "+"}</span>
      </button>
      {isOpen ? (
        <div id={contentId} style={{ marginTop: "1rem" }}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

function getJobCompletionNotificationPreference(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const stored = window.localStorage.getItem(JOB_COMPLETION_NOTIFICATION_STORAGE_KEY);
  if (stored === null) {
    return false;
  }

  return stored === "true";
}

type AdminTabProps = {
  enabled: boolean;
  onImpersonated: (username: string) => void;
};

export function AdminTab({ enabled, onImpersonated }: AdminTabProps) {
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [jobCompletionNotificationsEnabled, setJobCompletionNotificationsEnabled] = useState<boolean>(() => getJobCompletionNotificationPreference());

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(JOB_COMPLETION_NOTIFICATION_STORAGE_KEY, String(jobCompletionNotificationsEnabled));
    }
  }, [jobCompletionNotificationsEnabled]);

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
      <CollapsibleSection title="Impersonate User">
        <div className="section-stack">
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
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Notifications">
        <label className="field" htmlFor="job-completion-notifications-toggle">
          <span>Job completion notifications</span>
          <input
            id="job-completion-notifications-toggle"
            type="checkbox"
            checked={jobCompletionNotificationsEnabled}
            onChange={(event) => setJobCompletionNotificationsEnabled(event.target.checked)}
          />
        </label>
      </CollapsibleSection>

      <CollapsibleSection title="Credit Administration">
        <CreditAdminPanel />
      </CollapsibleSection>

      <CollapsibleSection title="Workflow Uploads">
        <WorkflowUploadsPanel />
      </CollapsibleSection>

      <CollapsibleSection title="Model Downloads">
        <ModelDownloadsPanel enabled={enabled} />
      </CollapsibleSection>
    </div>
  );
}

