import { useState } from "react";
import { InviteGate } from "./features/access/InviteGate";
import { RunpodKeySettings } from "./features/access/RunpodKeySettings";
import { RunpodProxySmoke } from "./features/access/RunpodProxySmoke";
import { DynamicInputEditor } from "./features/inputs/DynamicInputEditor";
import { ActiveWorkflowTemplate } from "./features/workflows/ActiveWorkflowTemplate";
import { WorkflowImport } from "./features/workflows/WorkflowImport";
import { useActiveWorkflowTemplate } from "./features/workflows/useActiveWorkflowTemplate";
import { runViaProxy } from "./lib/api/runpodProxyClient";
import { getRunpodKey } from "./lib/runpodKeyStorage";

function toRunpodWorkflowInput(payload: Record<string, unknown>): Record<string, unknown> {
  if ("workflow" in payload) {
    return payload;
  }

  return {
    workflow: payload
  };
}

export function App() {
  const [invited, setInvited] = useState(false);
  const [runpodKey, setRunpodKey] = useState(getRunpodKey());
  const [runEndpointId, setRunEndpointId] = useState("");
  const [runResult, setRunResult] = useState("");
  const [runError, setRunError] = useState("");
  const { activeTemplate, isLoading, error, persistTemplate, clearTemplate } =
    useActiveWorkflowTemplate();

  async function onRunPayloadBuilt(payload: Record<string, unknown>): Promise<void> {
    if (!runpodKey || !runEndpointId) {
      setRunError("Set Runpod key and endpoint ID before running.");
      return;
    }

    try {
      setRunError("");
      const response = await runViaProxy({
        endpointId: runEndpointId,
        apiKey: runpodKey,
        input: toRunpodWorkflowInput(payload)
      });
      setRunResult(JSON.stringify(response));
    } catch (submitError) {
      setRunError(submitError instanceof Error ? submitError.message : "Run submission failed.");
    }
  }

  if (!invited) {
    return <InviteGate onInvited={() => setInvited(true)} />;
  }

  return (
    <main>
      <h1>Chara2Img Web</h1>
      <p>Invited session active.</p>
      <RunpodKeySettings onKeyChanged={setRunpodKey} />
      <p>Runpod key configured: {runpodKey ? "Yes" : "No"}</p>
      <label htmlFor="run-endpoint-id">Run Endpoint ID</label>
      <input
        id="run-endpoint-id"
        value={runEndpointId}
        onChange={(event) => setRunEndpointId(event.target.value)}
      />
      {runpodKey ? <RunpodProxySmoke apiKey={runpodKey} /> : null}
      <WorkflowImport onImported={persistTemplate} />
      <ActiveWorkflowTemplate
        activeTemplate={activeTemplate}
        isLoading={isLoading}
        error={error}
        onClear={() => {
          void clearTemplate();
        }}
      />
      <p>Workflow template loaded: {activeTemplate ? "Yes" : "No"}</p>
      {activeTemplate ? <DynamicInputEditor activeTemplate={activeTemplate} onRunPayloadBuilt={onRunPayloadBuilt} /> : null}
      {runError ? <p role="alert">{runError}</p> : null}
      {runResult ? <pre>{runResult}</pre> : null}
    </main>
  );
}

