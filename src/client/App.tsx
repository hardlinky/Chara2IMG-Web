import { useState, useEffect } from "react";
import { InviteGate } from "./features/access/InviteGate";
import { RunpodKeySettings } from "./features/access/RunpodKeySettings";
import { RunpodProxySmoke } from "./features/access/RunpodProxySmoke";
import { DynamicInputEditor } from "./features/inputs/DynamicInputEditor";
import { ActiveWorkflowTemplate } from "./features/workflows/ActiveWorkflowTemplate";
import { WorkflowImport } from "./features/workflows/WorkflowImport";
import { useActiveWorkflowTemplate } from "./features/workflows/useActiveWorkflowTemplate";
import { OutputsTab } from "./features/outputs/OutputsTab";
import { submitRunAndPersistRecentJob } from "./lib/jobSubmission";
import { getRunpodKey } from "./lib/runpodKeyStorage";
import { getStoredEndpointId, saveEndpointId } from "./lib/endpointStorage";
import { fetchSystemConfig } from "./lib/api/runpodProxyClient";
import { formatSubmittedAtRelative } from "./features/jobs/jobStatus";
import { useRecentJobs } from "./features/jobs/useRecentJobs";
import { RecentJobsPanel } from "./features/jobs/RecentJobsPanel";
import type { DynamicInputDraftValues } from "../shared/contracts/inputs";

function toRunpodWorkflowInput(payload: Record<string, unknown>): Record<string, unknown> {
  if ("workflow" in payload) {
    return payload;
  }

  return {
    workflow: payload
  };
}

export function App() {
  const [activeTab, setActiveTab] = useState<"setup" | "input" | "jobs" | "output">("setup");
  const [invited, setInvited] = useState(false);
  const [runpodKey, setRunpodKey] = useState(getRunpodKey());
  const [runEndpointId, setRunEndpointId] = useState(() => getStoredEndpointId() ?? "");

  useEffect(() => {
    if (runEndpointId) {
      return;
    }

    void fetchSystemConfig().then((config) => {
      if (config.endpointId) {
        setRunEndpointId(config.endpointId);
      }
    });
  }, []);

  function updateEndpointId(value: string): void {
    setRunEndpointId(value);
    saveEndpointId(value);
  }
  const [runResult, setRunResult] = useState("");
  const [runError, setRunError] = useState("");
  const [jobActionMessage, setJobActionMessage] = useState("");
  const [editorApi, setEditorApi] = useState<{
    applyExternalDraftValues: (
      sourceTemplateFingerprint: string,
      externalDraftValues: DynamicInputDraftValues
    ) => Promise<{ ok: true; draftValues: DynamicInputDraftValues } | { ok: false; reason: string }>;
  } | null>(null);
  const { activeTemplate, isLoading, error, persistTemplate, clearTemplate } =
    useActiveWorkflowTemplate();
  const recentJobs = useRecentJobs({ endpointId: runEndpointId, apiKey: runpodKey ?? undefined });

  async function onRunPayloadBuilt(snapshot: {
    payload: Record<string, unknown>;
    draftValues: DynamicInputDraftValues;
    templateFingerprint: string;
  }): Promise<void> {
    if (!runpodKey || !runEndpointId) {
      setRunError("Set Runpod key and endpoint ID before running.");
      return;
    }

    if (!activeTemplate) {
      setRunError("Load a workflow template before running.");
      return;
    }

    try {
      setRunError("");
      const response = await submitRunAndPersistRecentJob({
        endpointId: runEndpointId,
        apiKey: runpodKey,
        submittedInput: toRunpodWorkflowInput(snapshot.payload),
        snapshot: {
          templateFingerprint: snapshot.templateFingerprint,
          workflowFileName: activeTemplate.displayName,
          draftValues: snapshot.draftValues,
          submittedInput: toRunpodWorkflowInput(snapshot.payload)
        }
      });
      await recentJobs.handleNewSubmission();
      setRunResult(JSON.stringify(response));
    } catch (submitError) {
      setRunError(submitError instanceof Error ? submitError.message : "Run submission failed.");
    }
  }

  async function onLoadInputs(jobId: string): Promise<void> {
    if (!activeTemplate) {
      setJobActionMessage("Load a workflow template before loading prior inputs.");
      return;
    }

    const job = await recentJobs.loadJobInputs(jobId);
    if (!job) {
      setJobActionMessage("Selected job is no longer available.");
      return;
    }

    if (!editorApi) {
      setJobActionMessage("Input editor is not ready yet.");
      return;
    }

    const result = await editorApi.applyExternalDraftValues(job.provenance.templateFingerprint, job.provenance.draftValues);
    if (!result.ok) {
      setJobActionMessage(result.reason);
      return;
    }

    setJobActionMessage(`Loaded inputs from ${job.jobId}.`);
  }

  if (!invited) {
    return <InviteGate onInvited={() => setInvited(true)} />;
  }

  return (
    <main>
      <h1>Chara2Img Web</h1>
      <p>Invited session active.</p>
      <div>
        <button type="button" onClick={() => setActiveTab("setup")} disabled={activeTab === "setup"}>
          Setup
        </button>
        <button type="button" onClick={() => setActiveTab("input")} disabled={activeTab === "input"}>
          Input
        </button>
        <button type="button" onClick={() => setActiveTab("jobs")} disabled={activeTab === "jobs"}>
          Jobs
        </button>
        <button type="button" onClick={() => setActiveTab("output")} disabled={activeTab === "output"}>
          Output
        </button>
      </div>

      {activeTab === "setup" ? (
        <>
          <RunpodKeySettings onKeyChanged={setRunpodKey} />
          <p>Runpod key configured: {runpodKey ? "Yes" : "No"}</p>
          <label htmlFor="run-endpoint-id">Run Endpoint ID</label>
          <input
            id="run-endpoint-id"
            value={runEndpointId}
            onChange={(event) => updateEndpointId(event.target.value)}
          />
          {runpodKey ? (
            <RunpodProxySmoke
              apiKey={runpodKey}
              endpointId={runEndpointId}
              onEndpointIdChange={updateEndpointId}
            />
          ) : null}
          <WorkflowImport onImported={persistTemplate} />
          <ActiveWorkflowTemplate
            activeTemplate={activeTemplate}
            isLoading={isLoading}
            error={error}
            onClear={() => {
              void clearTemplate();
            }}
          />
        </>
      ) : activeTab === "input" ? (
        <>
          <p>Workflow template loaded: {activeTemplate ? "Yes" : "No"}</p>
          {activeTemplate ? (
            <DynamicInputEditor
              activeTemplate={activeTemplate}
              onRunPayloadBuilt={onRunPayloadBuilt}
              onEditorReady={(api) => setEditorApi(api)}
            />
          ) : (
            <p>Import a workflow in Setup before editing inputs.</p>
          )}
          {runError ? <p role="alert">{runError}</p> : null}
          {runResult ? <pre>{runResult}</pre> : null}
        </>
      ) : activeTab === "jobs" ? (
        <>
          {jobActionMessage ? <p role="status">{jobActionMessage}</p> : null}
          <RecentJobsPanel
            jobs={recentJobs.jobs}
            warningJobIds={recentJobs.warningJobIds}
            cancelingJobIds={recentJobs.cancelingJobIds}
            statusFilter={recentJobs.statusFilter}
            page={recentJobs.page}
            pageCount={recentJobs.pageCount}
            pageNumbers={recentJobs.pageNumbers}
            onStatusFilterChange={recentJobs.setStatusFilter}
            onPageChange={recentJobs.setPage}
            onCancel={(jobId) => void recentJobs.cancelJob(jobId)}
            onRerun={(jobId) => void recentJobs.rerunJob(jobId)}
            onLoadInputs={(jobId) => void onLoadInputs(jobId)}
            onRemoveVisible={(jobId) => void recentJobs.removeVisibleJob(jobId)}
            formatSubmittedAtRelative={formatSubmittedAtRelative}
          />
        </>
      ) : (
        <OutputsTab clusters={recentJobs.completedOutputClusters} />
      )}
    </main>
  );
}

