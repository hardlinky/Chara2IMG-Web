import { useEffect, useId, useState } from "react";
import {
  DEFAULT_RUNPOD_JOB_SETTINGS,
  EXECUTION_TIMEOUT_STEP_SECONDS,
  MAX_EXECUTION_TIMEOUT_SECONDS,
  formatExecutionTimeoutLabel,
  normalizeExecutionTimeoutSeconds,
  type RunpodJobSettings
} from "../../../shared/contracts/runpodSettings";
import { fetchRunpodJobSettings, saveRunpodJobSettings } from "../../lib/api/runpodSettingsClient";

export function RunpodJobSettingsPanel() {
  const webhookId = useId();
  const timeoutId = useId();
  const [settings, setSettings] = useState<RunpodJobSettings>(DEFAULT_RUNPOD_JOB_SETTINGS);
  const [webhookBaseUrl, setWebhookBaseUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchRunpodJobSettings()
      .then((response) => {
        if (cancelled) return;
        setSettings(response.settings);
        setWebhookBaseUrl(response.webhookBaseUrl);
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function save(next: RunpodJobSettings): Promise<void> {
    setIsBusy(true);
    setStatus("");
    try {
      const response = await saveRunpodJobSettings(next);
      setSettings(response.settings);
      setWebhookBaseUrl(response.webhookBaseUrl);
      setStatus("Saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="section-stack">
      <label className="field" htmlFor={webhookId}>
        <span>Use webhook</span>
        <input
          id={webhookId}
          type="checkbox"
          checked={settings.useWebhook}
          disabled={isBusy || !webhookBaseUrl}
          onChange={(event) => void save({ ...settings, useWebhook: event.target.checked })}
        />
      </label>
      <span className="status-inline">
        {webhookBaseUrl
          ? `RunPod calls ${webhookBaseUrl}/api/webhooks/runpod/... the moment a job finishes, so results appear without waiting for the next poll.`
          : "Unavailable: this server has no public URL. Set PUBLIC_BASE_URL so RunPod can reach it."}
      </span>

      <div className="field">
        <label htmlFor={timeoutId}>Job execution timeout (seconds)</label>
        <input
          className="input"
          id={timeoutId}
          type="number"
          min={0}
          max={MAX_EXECUTION_TIMEOUT_SECONDS}
          step={EXECUTION_TIMEOUT_STEP_SECONDS}
          value={settings.executionTimeoutSeconds}
          disabled={isBusy}
          onChange={(event) =>
            setSettings((current) => ({ ...current, executionTimeoutSeconds: Number(event.target.value) }))
          }
          onBlur={(event) => {
            const executionTimeoutSeconds = normalizeExecutionTimeoutSeconds(event.target.value);
            if (executionTimeoutSeconds !== settings.executionTimeoutSeconds) {
              void save({ ...settings, executionTimeoutSeconds });
            }
          }}
        />
      </div>
      <span className="status-inline">
        {settings.executionTimeoutSeconds > 0
          ? `Jobs are cancelled after ${formatExecutionTimeoutLabel(settings.executionTimeoutSeconds)}.`
          : "0 uses the timeout configured on the endpoint."}
      </span>

      {status ? <p className="status-inline">{status}</p> : null}
    </div>
  );
}
