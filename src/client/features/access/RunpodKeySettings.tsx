import { FormEvent, useMemo, useState } from "react";
import { clearRunpodKey, getRunpodKey, setRunpodKey } from "../../lib/runpodKeyStorage";

type RunpodKeySettingsProps = {
  onKeyChanged: (apiKey: string) => void;
};

export function RunpodKeySettings(props: RunpodKeySettingsProps) {
  const initialKey = useMemo(() => getRunpodKey(), []);
  const [apiKey, setApiKey] = useState(initialKey);
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
        <input
          className="input"
          id="runpod-api-key"
          name="runpod-api-key"
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          autoComplete="off"
          required
        />
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
