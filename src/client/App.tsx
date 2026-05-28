import { useEffect, useMemo, useState } from "react";
import { AppShell } from "./components/app-shell/AppShell";
import type { AppTabDefinition } from "./components/app-shell/TopTabRail";
import { InviteGate } from "./features/access/InviteGate";
import { RunpodKeySettings } from "./features/access/RunpodKeySettings";
import { DynamicInputEditor } from "./features/inputs/DynamicInputEditor";
import { formatSubmittedAtRelative } from "./features/jobs/jobStatus";
import { RecentJobsPanel } from "./features/jobs/RecentJobsPanel";
import { useRecentJobs } from "./features/jobs/useRecentJobs";
import { OutputsTab } from "./features/outputs/OutputsTab";
import { ActiveWorkflowTemplate } from "./features/workflows/ActiveWorkflowTemplate";
import { WorkflowImport } from "./features/workflows/WorkflowImport";
import { useActiveWorkflowTemplate } from "./features/workflows/useActiveWorkflowTemplate";
import { fetchSystemConfig, fetchSystemStorageStats, ProxyRequestError, updateAppViaProxy } from "./lib/api/runpodProxyClient";
import { getStoredEndpointId, saveEndpointId } from "./lib/endpointStorage";
import { APP_VERSION_LABEL } from "./lib/appVersion";
import { submitRunAndPersistRecentJob } from "./lib/jobSubmission";
import { getRunpodKey } from "./lib/runpodKeyStorage";
import { sanitizeWorkflowForExport } from "./lib/workflowExport";
import type { DynamicInputDraftValues } from "../shared/contracts/inputs";
import type { SystemStorageStats } from "./lib/api/runpodProxyClient";

const APP_ACTIVE_TAB_STORAGE_KEY = "chara2imgActiveTab";

function toRunpodWorkflowInput(payload: Record<string, unknown>): Record<string, unknown> {
  if ("workflow" in payload) {
    return payload;
  }

  return {
    workflow: payload
  };
}

function toWorkflowExportPayload(submittedInput: Record<string, unknown>): Record<string, unknown> | null {
  const workflow = submittedInput.workflow;
  if (workflow && typeof workflow === "object" && !Array.isArray(workflow)) {
    return workflow as Record<string, unknown>;
  }

  if (submittedInput && typeof submittedInput === "object" && !Array.isArray(submittedInput)) {
    return submittedInput;
  }

  return null;
}

function sanitizeFileNamePart(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return sanitized || "workflow";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const decimals = unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

function isSystemStorageStats(value: unknown): value is SystemStorageStats {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<SystemStorageStats>;
  return (
    record.ok === true &&
    typeof record.userUsedBytes === "number" &&
    typeof record.allUsersUsedBytes === "number" &&
    typeof record.totalCapacityBytes === "number"
  );
}

function describeStorageStatsError(error: unknown): string {
  if (error instanceof ProxyRequestError) {
    if (error.status === 200 && typeof error.data === "string" && /<!doctype html>/i.test(error.data)) {
      return " [backend restart required]";
    }

    return ` [server stats ${error.status}]`;
  }

  return " [server stats error]";
}

const BASE_APP_TABS: AppTabDefinition[] = [
  { id: "setup", label: "Setup" },
  { id: "input", label: "Input" },
  { id: "jobs", label: "Jobs" },
  { id: "output", label: "Output" }
];

const SERVER_MANAGED_RUNPOD_KEY = "__SERVER_MANAGED_RUNPOD_KEY__";

function getStoredActiveTab(): "setup" | "input" | "jobs" | "output" {
  if (typeof window === "undefined") {
    return "setup";
  }

  const stored = window.localStorage.getItem(APP_ACTIVE_TAB_STORAGE_KEY);
  return stored === "setup" || stored === "input" || stored === "jobs" || stored === "output" ? stored : "setup";
}

function persistActiveTab(tabId: "setup" | "input" | "jobs" | "output"): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(APP_ACTIVE_TAB_STORAGE_KEY, tabId);
}

export function App() {
  const [activeTab, setActiveTab] = useState<"setup" | "input" | "jobs" | "output">(() => getStoredActiveTab());
  const [invited, setInvited] = useState(false);
  const [runpodKey, setRunpodKey] = useState(getRunpodKey());
  const [hasServerRunpodApiKey, setHasServerRunpodApiKey] = useState(false);
  const [runEndpointId, setRunEndpointId] = useState(() => getStoredEndpointId() ?? "");
  const [runError, setRunError] = useState("");
  const [jobActionError, setJobActionError] = useState("");
  const [isUpdatingApp, setIsUpdatingApp] = useState(false);
  const [updateStatus, setUpdateStatus] = useState("");
  const [storageStatus, setStorageStatus] = useState(
    "Storage: browser unavailable | server you unavailable | server all unavailable | server cap unavailable"
  );
  const [editorApi, setEditorApi] = useState<{
    applyExternalDraftValues: (
      sourceTemplateFingerprint: string,
      externalDraftValues: DynamicInputDraftValues
    ) => Promise<{ ok: true; draftValues: DynamicInputDraftValues } | { ok: false; reason: string }>;
  } | null>(null);

  const { activeTemplate, isLoading, error, persistTemplate, clearTemplate } = useActiveWorkflowTemplate();

  const effectiveRunpodKey = hasServerRunpodApiKey ? SERVER_MANAGED_RUNPOD_KEY : runpodKey;

  useEffect(() => {
    if (!invited) {
      return;
    }

    void fetchSystemConfig()
      .then((config) => {
        if (!runEndpointId && config.endpointId) {
          setRunEndpointId(config.endpointId);
        }

        setHasServerRunpodApiKey(config.hasRunpodApiKey);
      })
      .catch(() => {
        // Keep setup usable even when config bootstrap is temporarily unavailable.
      });
  }, [invited, runEndpointId]);

  function updateEndpointId(value: string): void {
    setRunEndpointId(value);
    saveEndpointId(value);
  }

  const recentJobs = useRecentJobs({
    endpointId: runEndpointId,
    apiKey: effectiveRunpodKey || undefined,
    includeOutputClusters: activeTab === "output"
  });

  const pinnedJobsCount = recentJobs.pinnedVisibleCount;
  const pinnedImagesCount = recentJobs.pinnedImageCount;

  const appTabs = useMemo<AppTabDefinition[]>(
    () =>
      BASE_APP_TABS.map((tab) => {
        if (tab.id === "jobs" && pinnedJobsCount > 0) {
          return { ...tab, badge: pinnedJobsCount };
        }

        if (tab.id === "output" && pinnedImagesCount > 0) {
          return { ...tab, badge: pinnedImagesCount };
        }

        return tab;
      }),
    [pinnedJobsCount, pinnedImagesCount]
  );

  useEffect(() => {
    persistActiveTab(activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (!invited) {
      return;
    }

    let cancelled = false;
    setStorageStatus("Storage: checking...");

    const browserStorageEstimatePromise =
      typeof navigator !== "undefined" && navigator.storage?.estimate
        ? navigator.storage.estimate().catch(() => null)
        : Promise.resolve<StorageEstimate | null>(null);

    const serverStorageStatsPromise = fetchSystemStorageStats().catch((error: unknown) => error);

    void Promise.all([browserStorageEstimatePromise, serverStorageStatsPromise]).then(([browserEstimate, serverStatsResult]) => {
      if (cancelled) {
        return;
      }

      const browserUsedBytes = typeof browserEstimate?.usage === "number" ? browserEstimate.usage : null;
      const browserUsedLabel = browserUsedBytes !== null ? formatBytes(browserUsedBytes) : "unavailable";

      const hasServerStats = isSystemStorageStats(serverStatsResult);
      const serverUserUsedLabel = hasServerStats ? formatBytes(serverStatsResult.userUsedBytes) : "unavailable";
      const serverAllUsedLabel = hasServerStats ? formatBytes(serverStatsResult.allUsersUsedBytes) : "unavailable";
      const serverCapacityLabel = hasServerStats ? formatBytes(serverStatsResult.totalCapacityBytes) : "unavailable";
      const serverErrorLabel = hasServerStats ? "" : describeStorageStatsError(serverStatsResult);

      setStorageStatus(
        `Storage: browser ${browserUsedLabel} | server you ${serverUserUsedLabel} | server all ${serverAllUsedLabel} | server cap ${serverCapacityLabel}${serverErrorLabel}`
      );
    });

    return () => {
      cancelled = true;
    };
  }, [invited, recentJobs.pinnedImageCount, recentJobs.visibleJobs.length, recentJobs.completedOutputClusters.length, recentJobs.storageRefreshToken]);

  async function onRunPayloadBuilt(snapshot: {
    payload: Record<string, unknown>;
    draftValues: DynamicInputDraftValues;
    templateFingerprint: string;
  }): Promise<void> {
    if (!effectiveRunpodKey || !runEndpointId) {
      setRunError("Set endpoint ID and Runpod key before running.");
      return;
    }

    if (!activeTemplate) {
      setRunError("Load a workflow template before running.");
      return;
    }

    try {
      setRunError("");
      await submitRunAndPersistRecentJob({
        endpointId: runEndpointId,
        apiKey: effectiveRunpodKey,
        submittedInput: toRunpodWorkflowInput(snapshot.payload),
        snapshot: {
          templateFingerprint: snapshot.templateFingerprint,
          workflowFileName: activeTemplate.displayName,
          draftValues: snapshot.draftValues,
          submittedInput: toRunpodWorkflowInput(snapshot.payload)
        }
      });
      await recentJobs.handleNewSubmission();
    } catch (submitError) {
      setRunError(submitError instanceof Error ? submitError.message : "Run submission failed.");
    }
  }

  async function onLoadInputs(jobId: string): Promise<void> {
    if (!activeTemplate) {
      setJobActionError("Load a workflow template before loading prior inputs.");
      return;
    }

    const job = await recentJobs.loadJobInputs(jobId);
    if (!job) {
      setJobActionError("Selected job is no longer available.");
      return;
    }

    if (!editorApi) {
      setJobActionError("Input editor is not ready yet.");
      return;
    }

    const result = await editorApi.applyExternalDraftValues(job.provenance.templateFingerprint, job.provenance.draftValues);
    if (!result.ok) {
      setJobActionError(result.reason);
      return;
    }

    setJobActionError("");
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

  async function onExportWorkflow(jobId: string): Promise<void> {
    const job = await recentJobs.loadJobInputs(jobId);
    if (!job) {
      setJobActionError("Selected job is no longer available.");
      return;
    }

    if (job.lifecycle.status !== "COMPLETED") {
      setJobActionError("Only completed jobs can be exported.");
      return;
    }

    const workflowPayload = toWorkflowExportPayload(job.provenance.submittedInput);
    if (!workflowPayload) {
      setJobActionError("This job does not include an exportable workflow payload.");
      return;
    }

    const sanitizedWorkflowPayload = sanitizeWorkflowForExport(workflowPayload);
    const fileBase = sanitizeFileNamePart(job.provenance.workflowFileName ?? "workflow").replace(/\.json$/i, "");
    const fileName = `${fileBase}-${sanitizeFileNamePart(job.jobId)}-populated.json`;
    const blob = new Blob([JSON.stringify(sanitizedWorkflowPayload, null, 2)], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(objectUrl);

    setJobActionError("");
  }

  if (!invited) {
    return <InviteGate onInvited={() => setInvited(true)} />;
  }

  return (
    <AppShell
      tabs={appTabs}
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
          <span>{`Runpod key: ${runpodKey || hasServerRunpodApiKey ? "Configured" : "Missing"}`}</span>
          <span>{`Endpoint: ${runEndpointId || "Not set"}`}</span>
          <span>{`Template: ${activeTemplate ? "Loaded" : "Not loaded"}`}</span>
          <span>{storageStatus}</span>
          {updateStatus ? <span>{updateStatus}</span> : null}
        </>
      }
      panels={{
        setup: (
          <div className="section-stack">
            {hasServerRunpodApiKey ? (
              <section className="setup-card">
                <h2>Runpod API Key</h2>
                <p>Managed by pod environment variable `RUNPOD_API_KEY`.</p>
              </section>
            ) : (
              <RunpodKeySettings onKeyChanged={setRunpodKey} />
            )}
            <section className="card field">
              <label htmlFor="run-endpoint-id">Run Endpoint ID</label>
              <input
                className="input"
                id="run-endpoint-id"
                value={runEndpointId}
                onChange={(event) => updateEndpointId(event.target.value)}
              />
            </section>
            <WorkflowImport onImported={persistTemplate} currentTemplate={activeTemplate} />
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
                isActive={activeTab === "input"}
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
          </div>
        ),
        jobs: (
          <div className="section-stack">
            {jobActionError ? (
              <p role="alert" className="status-inline" data-tone="error">
                {jobActionError}
              </p>
            ) : null}
            <RecentJobsPanel
              jobs={recentJobs.jobs}
              filteredJobCount={recentJobs.filteredJobs.length}
              pinnedJobCount={recentJobs.pinnedVisibleCount}
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
              onPollStatus={(jobId) => void recentJobs.pollJob(jobId)}
              onLoadInputs={(jobId) => void onLoadInputs(jobId)}
              onExportWorkflow={(jobId) => void onExportWorkflow(jobId)}
              onRemoveVisible={(jobId) => void recentJobs.removeVisibleJob(jobId)}
              onViewOutputs={(jobId) => {
                setActiveTab("output");
                setTimeout(() => {
                  // @ts-ignore: OutputsTab uses useOutputGallery, which exposes openJobOutputs on window for this hack
                  if (window.__openJobOutputs) window.__openJobOutputs(jobId);
                }, 0);
              }}
              formatSubmittedAtRelative={formatSubmittedAtRelative}
            />
          </div>
        ),
        output: (
          <OutputsTab
            clusters={recentJobs.completedOutputClusters}
            onLoadOutputCluster={(jobId) => recentJobs.loadOutputCluster(jobId)}
            onRerun={(jobId) => void recentJobs.rerunJob(jobId)}
            onLoadInputs={(jobId) => void onLoadInputs(jobId)}
            onRemoveJobOutputs={(jobId) => void recentJobs.removeJobOutputs(jobId)}
            onRemoveOutputImage={(jobId, outputIndex) => void recentJobs.removeOutputImage(jobId, outputIndex)}
            onExportWorkflow={(jobId) => void onExportWorkflow(jobId)}
            onToggleOutputPinned={async (jobId, outputIndex, pinned) => {
              const result = await recentJobs.togglePinnedImage(jobId, outputIndex, pinned);
              if (!result.ok) {
                setJobActionError(result.reason);
              } else {
                setJobActionError("");
              }
            }}
            canPinMore={recentJobs.canPinMoreJobs}
          />
        )
      }}
    />
  );
}
