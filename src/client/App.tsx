import { useState, useEffect } from "react";
import { AppShell } from "./components/app-shell/AppShell";
import type { AppTabDefinition } from "./components/app-shell/TopTabRail";
import { InviteGate } from "./features/access/InviteGate";
import { RunpodKeySettings } from "./features/access/RunpodKeySettings";
import { DynamicInputEditor } from "./features/inputs/DynamicInputEditor";
import { ActiveWorkflowTemplate } from "./features/workflows/ActiveWorkflowTemplate";
import { WorkflowImport } from "./features/workflows/WorkflowImport";
import { useActiveWorkflowTemplate } from "./features/workflows/useActiveWorkflowTemplate";
import { OutputsTab } from "./features/outputs/OutputsTab";
import { submitRunAndPersistRecentJob } from "./lib/jobSubmission";
import { getRunpodKey } from "./lib/runpodKeyStorage";
import { getStoredEndpointId, saveEndpointId } from "./lib/endpointStorage";
import { fetchSystemConfig, updateAppViaProxy } from "./lib/api/runpodProxyClient";
import { formatSubmittedAtRelative } from "./features/jobs/jobStatus";
import { useRecentJobs } from "./features/jobs/useRecentJobs";
import { RecentJobsPanel } from "./features/jobs/RecentJobsPanel";
import { APP_VERSION_LABEL } from "./lib/appVersion";
import type { DynamicInputDraftValues } from "../shared/contracts/inputs";

function toRunpodWorkflowInput(payload: Record<string, unknown>): Record<string, unknown> {
  if ("workflow" in payload) {
    return payload;
  }

  return {
    workflow: payload
  };
}

const APP_TABS: AppTabDefinition[] = [
  { id: "setup", label: "Setup" },
  { id: "input", label: "Input" },
  { id: "jobs", label: "Jobs" },
  { id: "output", label: "Output" }
];

export function App() {
  const [activeTab, setActiveTab] = useState<"setup" | "input" | "jobs" | "output">("setup");
  const [invited, setInvited] = useState(false);
  const [runpodKey, setRunpodKey] = useState(getRunpodKey());
  const [runEndpointId, setRunEndpointId] = useState(() => getStoredEndpointId() ?? "");

  useEffect(() => {
    if (!invited || runEndpointId) {
      return;
    }

    void fetchSystemConfig()
      .then((config) => {
        if (config.endpointId) {
          setRunEndpointId(config.endpointId);
        }
      })
      .catch(() => {
        // Keep setup usable even when config bootstrap is temporarily unavailable.
      });
  }, [invited, runEndpointId]);

  function updateEndpointId(value: string): void {
    setRunEndpointId(value);
    saveEndpointId(value);
  }
  const [runResult, setRunResult] = useState("");
  const [runError, setRunError] = useState("");
  const [jobActionMessage, setJobActionMessage] = useState("");
  const [isUpdatingApp, setIsUpdatingApp] = useState(false);
  const [updateStatus, setUpdateStatus] = useState("");
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

  async function onUpdateApp(): Promise<void> {
    setIsUpdatingApp(true);
    setUpdateStatus("Updating app...");

    try {
      const result = await updateAppViaProxy();
      if (!result.ok) {
        setUpdateStatus(`Update failed: ${result.error ?? "Unknown error"}`);
        return;
      }

      setUpdateStatus("Update complete. Reloading...");
      window.setTimeout(() => {
        window.location.reload();
      }, 700);
    } catch (error) {
      setUpdateStatus(`Update failed: ${error instanceof Error ? error.message : "Unexpected update error"}`);
    } finally {
      setIsUpdatingApp(false);
    }
  }

  if (!invited) {
    return <InviteGate onInvited={() => setInvited(true)} />;
  }

  return (
    <AppShell
      tabs={APP_TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      headerRowOne={
        <>
          <h1>{`Chara2IMG Web ${APP_VERSION_LABEL}`}</h1>
          <div className="app-header-right">
            <button className="btn btn-secondary" type="button" onClick={() => void onUpdateApp()} disabled={isUpdatingApp}>
              {isUpdatingApp ? "Updating..." : "Update App"}
            </button>
            <p className="app-header-status">Invited session active.</p>
          </div>
        </>
      }
      headerRowTwo={
        <>
          <span>{`Runpod key: ${runpodKey ? "Configured" : "Missing"}`}</span>
          <span>{`Endpoint: ${runEndpointId || "Not set"}`}</span>
          <span>{`Template: ${activeTemplate ? "Loaded" : "Not loaded"}`}</span>
          {updateStatus ? <span>{updateStatus}</span> : null}
        </>
      }
      panels={{
        setup: (
          <div className="section-stack">
            <RunpodKeySettings onKeyChanged={setRunpodKey} />
            <section className="card field">
              <label htmlFor="run-endpoint-id">Run Endpoint ID</label>
              <input
                className="input"
                id="run-endpoint-id"
                value={runEndpointId}
                onChange={(event) => updateEndpointId(event.target.value)}
              />
            </section>
            <WorkflowImport onImported={persistTemplate} />
            <ActiveWorkflowTemplate
              activeTemplate={activeTemplate}
              isLoading={isLoading}
              error={error}
              onClear={() => {
                void clearTemplate();
              }}
            />
          </div>
        ),
        input: (
          <div className="section-stack">
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
            {runError ? (
              <p role="alert" className="status-inline" data-tone="error">
                {runError}
              </p>
            ) : null}
            {runResult ? <pre className="card">{runResult}</pre> : null}
          </div>
        ),
        jobs: (
          <div className="section-stack">
            {jobActionMessage ? (
              <p role="status" className="status-inline" data-tone="success">
                {jobActionMessage}
              </p>
            ) : null}
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
          </div>
        ),
        output: <OutputsTab clusters={recentJobs.completedOutputClusters} />
      }}
    />
  );
}

