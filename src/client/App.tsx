import { useState } from "react";
import { InviteGate } from "./features/access/InviteGate";
import { RunpodKeySettings } from "./features/access/RunpodKeySettings";
import { RunpodProxySmoke } from "./features/access/RunpodProxySmoke";
import { DynamicInputEditor } from "./features/inputs/DynamicInputEditor";
import { ActiveWorkflowTemplate } from "./features/workflows/ActiveWorkflowTemplate";
import { WorkflowImport } from "./features/workflows/WorkflowImport";
import { useActiveWorkflowTemplate } from "./features/workflows/useActiveWorkflowTemplate";
import { getRunpodKey } from "./lib/runpodKeyStorage";

export function App() {
  const [invited, setInvited] = useState(false);
  const [runpodKey, setRunpodKey] = useState(getRunpodKey());
  const { activeTemplate, isLoading, error, persistTemplate, clearTemplate } =
    useActiveWorkflowTemplate();

  if (!invited) {
    return <InviteGate onInvited={() => setInvited(true)} />;
  }

  return (
    <main>
      <h1>Chara2Img Web</h1>
      <p>Invited session active.</p>
      <RunpodKeySettings onKeyChanged={setRunpodKey} />
      <p>Runpod key configured: {runpodKey ? "Yes" : "No"}</p>
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
      {activeTemplate ? <DynamicInputEditor activeTemplate={activeTemplate} /> : null}
    </main>
  );
}

