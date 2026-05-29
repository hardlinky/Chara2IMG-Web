import { FormEvent, useMemo, useState } from "react";
import { clearRunpodKey, getRunpodKey, setRunpodKey } from "../../lib/runpodKeyStorage";

type RunpodKeySettingsProps = {
  onKeyChanged: (apiKey: string) => void;
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

export function RunpodKeySettings(props: RunpodKeySettingsProps) {
  const initialKey = useMemo(() => getRunpodKey(), []);
  const [apiKey, setApiKey] = useState(initialKey);
  const [showApiKey, setShowApiKey] = useState(false);
  const [rememberOnThisBrowser, setRememberOnThisBrowser] = useState(Boolean(initialKey));
  const [savedMessage, setSavedMessage] = useState("");

  function onSave(event: FormEvent): void {
    event.preventDefault();

    setRunpodKey(apiKey, rememberOnThisBrowser);
    props.onKeyChanged(apiKey);
    setSavedMessage(rememberOnThisBrowser ? "Saved on this browser." : "Saved for this session only.");
  }

  function onClear(): void {
    clearRunpodKey();
    setApiKey("");
    setRememberOnThisBrowser(false);
    props.onKeyChanged("");
    setSavedMessage("Runpod API key cleared.");
  }

  return (
    <section className="setup-card">
      <h2>Runpod API Key</h2>
      <p>Bring your own key. Keep it in memory by default, or remember on this browser.</p>

      <form className="setup-form" onSubmit={onSave}>
        <label className="field" htmlFor="runpod-api-key">
          Runpod API key
          <span className="password-input-wrap">
            <input
              className="input"
              id="runpod-api-key"
              name="runpod-api-key"
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              autoComplete="off"
              required
            />
            <button
              className="password-visibility-toggle"
              type="button"
              aria-label={showApiKey ? "Hide password" : "Show password"}
              title={showApiKey ? "Hide password" : "Show password"}
              onClick={() => setShowApiKey((current) => !current)}
            >
              <EyeIcon visible={showApiKey} />
            </button>
          </span>
        </label>

        <label htmlFor="remember-on-this-browser">
          <input
            id="remember-on-this-browser"
            type="checkbox"
            checked={rememberOnThisBrowser}
            onChange={(event) => setRememberOnThisBrowser(event.target.checked)}
          />
          Remember on this browser
        </label>

        <div className="setup-actions">
          <button className="btn btn-primary" type="submit">
            Save key
          </button>
          <button className="btn btn-destructive" type="button" onClick={onClear}>
            Clear key
          </button>
        </div>
      </form>

      {savedMessage ? (
        <p role="status" className="status-inline" data-tone="success">
          {savedMessage}
        </p>
      ) : null}
    </section>
  );
}
