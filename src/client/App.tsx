import { useState } from "react";
import { InviteGate } from "./features/access/InviteGate";
import { RunpodKeySettings } from "./features/access/RunpodKeySettings";
import { RunpodProxySmoke } from "./features/access/RunpodProxySmoke";
import { WorkflowImport } from "./features/workflows/WorkflowImport";
import { getRunpodKey } from "./lib/runpodKeyStorage";
import type { WorkflowTemplateRecord } from "../shared/contracts/workflow";

export function App() {
  const [invited, setInvited] = useState(false);
  const [runpodKey, setRunpodKey] = useState(getRunpodKey());
  const [activeWorkflowTemplate, setActiveWorkflowTemplate] =
    useState<WorkflowTemplateRecord | null>(null);

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
      <WorkflowImport onImported={setActiveWorkflowTemplate} />
      <p>Workflow template loaded: {activeWorkflowTemplate ? "Yes" : "No"}</p>
    </main>
  );
}
