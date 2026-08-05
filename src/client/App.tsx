import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./components/app-shell/AppShell";
import type { AppTabDefinition } from "./components/app-shell/TopTabRail";
import { AdminGate } from "./features/access/AdminGate";
import { AdminTab } from "./features/access/AdminTab";
import { InviteGate } from "./features/access/InviteGate";
import { RunpodKeySettings } from "./features/access/RunpodKeySettings";
import { DynamicInputEditor } from "./features/inputs/DynamicInputEditor";
import { formatSubmittedAtRelative } from "./features/jobs/jobStatus";
import { RecentJobsPanel } from "./features/jobs/RecentJobsPanel";
import { useRecentJobs } from "./features/jobs/useRecentJobs";
import { OutputsTab } from "./features/outputs/OutputsTab";
import { AlbumsTab } from "./features/albums/AlbumsTab";
import { useAlbums } from "./features/albums/useAlbums";
import type { AlbumStarContext } from "./features/albums/albumStar";
import { formatOutputJobId } from "./features/outputs/formatOutputJobId";
import { ActiveWorkflowTemplate } from "./features/workflows/ActiveWorkflowTemplate";
import { WorkflowImport } from "./features/workflows/WorkflowImport";
import { useActiveWorkflowTemplate } from "./features/workflows/useActiveWorkflowTemplate";
import { fetchSystemConfig, fetchSystemStorageStats, ProxyRequestError, updateAppViaProxy } from "./lib/api/runpodProxyClient";
import { getJobInputs } from "./lib/api/jobsClient";
import { clearImageCache } from "./lib/imageCache";
import { getStoredEndpointId, saveEndpointId } from "./lib/endpointStorage";
import { getRoute, navigate, useRoute } from "./lib/appRouter";
import { APP_VERSION, APP_VERSION_LABEL } from "./lib/appVersion";
import { submitRunAndPersistRecentJob } from "./lib/jobSubmission";
import { showToast } from "./lib/toast";
import { getRunpodKey } from "./lib/runpodKeyStorage";
import { sanitizeWorkflowForExport } from "./lib/workflowExport";
import type { DynamicInputDraftValues } from "../shared/contracts/inputs";
import type { SystemStorageStats } from "./lib/api/runpodProxyClient";
import { deriveInputControls } from "../shared/workflow/deriveInputControls";

const APP_ACTIVE_TAB_STORAGE_KEY = "chara2imgActiveTab";
const APP_VERSION_STORAGE_KEY = "chara2imgAppVersion";

type AppTabId = "input" | "jobs" | "output" | "albums" | "admin";

// A new app build clears transient navigation (active tab + URL tab/job params)
// so stale, possibly-expired job references don't resurrect on load.
function resetTransientStateOnVersionChange(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (window.localStorage.getItem(APP_VERSION_STORAGE_KEY) === APP_VERSION) {
    return;
  }

  window.localStorage.setItem(APP_VERSION_STORAGE_KEY, APP_VERSION);
  window.localStorage.removeItem(APP_ACTIVE_TAB_STORAGE_KEY);

  const params = new URLSearchParams(window.location.search);
  params.delete("tab");
  params.delete("job");
  params.delete("album");
  const search = params.toString();
  const url = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", url);
}

resetTransientStateOnVersionChange();

function isAppTabId(value: string | null): value is AppTabId {
  return value === "input" || value === "jobs" || value === "output" || value === "albums" || value === "admin";
}

function getInitialActiveTab(): AppTabId {
  const routeTab = getRoute().tab;
  if (isAppTabId(routeTab)) {
    return routeTab;
  }

  return getStoredActiveTab();
}

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


function normalizeWorkflowSource(rawJson: unknown): unknown {
  if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) {
    return rawJson;
  }

  const record = rawJson as Record<string, unknown>;
  const nestedWorkflow = record.workflow;
  if (nestedWorkflow && typeof nestedWorkflow === "object" && !Array.isArray(nestedWorkflow)) {
    return nestedWorkflow;
  }

  return rawJson;
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
  { id: "input", label: "Input" },
  { id: "jobs", label: "Jobs" },
  { id: "output", label: "Output" },
  { id: "albums", label: "Albums" }
];

const SERVER_MANAGED_RUNPOD_KEY = "__SERVER_MANAGED_RUNPOD_KEY__";

function getStoredActiveTab(): "input" | "jobs" | "output" | "albums" | "admin" {
  if (typeof window === "undefined") {
    return "input";
  }

  const stored = window.localStorage.getItem(APP_ACTIVE_TAB_STORAGE_KEY);
  return stored === "input" || stored === "jobs" || stored === "output" || stored === "albums" || stored === "admin" ? stored : "input";
}

function persistActiveTab(tabId: "input" | "jobs" | "output" | "albums" | "admin"): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(APP_ACTIVE_TAB_STORAGE_KEY, tabId);
}

async function resolveImageDataUrl(imageUrl: string): Promise<string | null> {
  if (imageUrl.startsWith("data:")) {
    return imageUrl;
  }

  try {
    const response = await fetch(imageUrl, { credentials: "include" });
    if (!response.ok) {
      return null;
    }
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
      reader.addEventListener("error", () => resolve(null));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function App() {
  const [activeTab, setActiveTab] = useState<AppTabId>(() => getInitialActiveTab());
  const route = useRoute();
  const isFirstRouteSyncRef = useRef(true);
  const [invited, setInvited] = useState(false);
  const [adminGranted, setAdminGranted] = useState(false);
  const [runpodKey, setRunpodKey] = useState(getRunpodKey());
  const [hasServerRunpodApiKey, setHasServerRunpodApiKey] = useState(false);
  const [runEndpointId, setRunEndpointId] = useState(() => getStoredEndpointId() ?? "");
  const [runError, setRunError] = useState("");
  const [isSubmittingRun, setIsSubmittingRun] = useState(false);
  const [jobActionError, setJobActionError] = useState("");
  const [isUpdatingApp, setIsUpdatingApp] = useState(false);
  const [updateStatus, setUpdateStatus] = useState("");
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [clearCacheStatus, setClearCacheStatus] = useState("");
  const [storageStatus, setStorageStatus] = useState(
    "Storage: cache unavailable | archive (all) unavailable"
  );
  const [editorApi, setEditorApi] = useState<{
    applyExternalDraftValues: (
      sourceTemplateFingerprint: string,
      externalDraftValues: DynamicInputDraftValues
    ) => Promise<{ ok: true; draftValues: DynamicInputDraftValues } | { ok: false; reason: string }>;
    applyImportedWorkflowInputs: (
      sourceWorkflowRawJson: unknown,
      selectedCategories: string[]
    ) => Promise<
      | {
          ok: true;
          draftValues: DynamicInputDraftValues;
          matchedControls: number;
          selectedCategories: string[];
        }
      | {
          ok: false;
          reason: string;
        }
    >;
    img2imgInputAvailable: boolean;
    setImg2ImgImage: (dataUrl: string) => boolean;
  } | null>(null);
  const [pendingJobInputImport, setPendingJobInputImport] = useState<{
    jobId: string;
    sourceTemplateName: string;
    sourceWorkflowRawJson: unknown;
    categories: Array<{ category: string; controlCount: number }>;
  } | null>(null);
  const [selectedJobInputCategories, setSelectedJobInputCategories] = useState<string[]>([]);
  const [isImportingJobInputs, setIsImportingJobInputs] = useState(false);

  const { activeTemplate, recentTemplates, isLoading, error, persistTemplate, clearTemplate, removeRecentTemplate } = useActiveWorkflowTemplate();

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

  const transientJobsCount = recentJobs.transientJobsCount;

  const albums = useAlbums(activeTab === "albums" || activeTab === "output");

  const albumStarContext = useMemo<AlbumStarContext>(
    () => ({
      albums: albums.albums,
      onToggleImageInAlbum: (albumId, jobId, imageIndex, next) => {
        if (next) {
          void albums.addImageToAlbum(albumId, jobId, imageIndex);
        } else {
          void albums.removeImageFromAlbum(albumId, jobId, imageIndex);
        }
      },
      onCreateAlbumWithImage: (name, jobId, imageIndex) => {
        void albums.createAlbum({ name, jobId, imageIndex });
      }
    }),
    [albums.albums, albums.addImageToAlbum, albums.removeImageFromAlbum, albums.createAlbum]
  );

  const appTabs = useMemo<AppTabDefinition[]>(
    () =>
      BASE_APP_TABS.map((tab) => {
        if (tab.id === "jobs" && transientJobsCount > 0) {
          return { ...tab, badge: transientJobsCount };
        }

        return tab;
      }),
    [transientJobsCount]
  );

  useEffect(() => {
    document.title = transientJobsCount > 0 ? `(${transientJobsCount}) Chara2Img Web` : "Chara2Img Web";
  }, [transientJobsCount]);

  useEffect(() => {
    persistActiveTab(activeTab);
    if (getRoute().tab !== activeTab) {
      navigate({ tab: activeTab }, isFirstRouteSyncRef.current ? "replace" : "push");
    }
    isFirstRouteSyncRef.current = false;
  }, [activeTab]);

  useEffect(() => {
    if (isAppTabId(route.tab) && route.tab !== activeTab) {
      setActiveTab(route.tab);
    }
    // Only react to URL changes (e.g. browser back/forward); activeTab is intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.tab]);

  useEffect(() => {
    if (!invited) {
      return;
    }

    let cancelled = false;

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
      const serverAllUsedLabel = hasServerStats ? formatBytes(serverStatsResult.allUsersUsedBytes) : "unavailable";
      const serverErrorLabel = hasServerStats ? "" : describeStorageStatsError(serverStatsResult);

      setStorageStatus(
        `Storage: cache ${browserUsedLabel} | archive (all) ${serverAllUsedLabel}${serverErrorLabel}`
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
      setIsSubmittingRun(true);
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
      showToast("Job submitted \u2014 it will appear in Jobs shortly.", { tone: "success" });
    } catch (submitError) {
      setRunError(submitError instanceof Error ? submitError.message : "Run submission failed.");
    } finally {
      setIsSubmittingRun(false);
    }
  }

  async function handleRerun(jobId: string): Promise<void> {
    try {
      await recentJobs.rerunJob(jobId);
      showToast("Job resubmitted \u2014 it will appear in Jobs shortly.", { tone: "success" });
    } catch (rerunError) {
      showToast(rerunError instanceof Error ? rerunError.message : "Rerun failed.", { tone: "error" });
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

    const serverInputs = await getJobInputs(jobId);
    const sourceWorkflowRawJson = normalizeWorkflowSource(
      serverInputs?.submittedInput ?? job.provenance.submittedInput
    );
    const derivation = deriveInputControls(sourceWorkflowRawJson);
    const categories = derivation.sections.map((section) => ({
      category: section.category,
      controlCount: section.controlIds.length
    }));

    if (categories.length === 0) {
      setJobActionError("No importable input categories were found in that job.");
      return;
    }

    setPendingJobInputImport({
      jobId,
      sourceTemplateName: job.provenance.workflowFileName ?? jobId,
      sourceWorkflowRawJson,
      categories
    });
    setSelectedJobInputCategories(categories.map((entry) => entry.category));
    setJobActionError("");
    setActiveTab("input");
  }

  async function onLoadImageIntoImg2Img(imageUrl: string): Promise<void> {
    if (!editorApi) {
      setJobActionError("Input editor is not ready yet.");
      return;
    }

    if (!editorApi.img2imgInputAvailable) {
      setJobActionError("The loaded workflow has no IMG2IMG input.");
      return;
    }

    const dataUrl = await resolveImageDataUrl(imageUrl);
    if (!dataUrl) {
      setJobActionError("Failed to load the image into the IMG2IMG input.");
      return;
    }

    if (!editorApi.setImg2ImgImage(dataUrl)) {
      setJobActionError("Failed to load the image into the IMG2IMG input.");
      return;
    }

    setJobActionError("");
    setActiveTab("input");
  }

  async function confirmJobInputImport(): Promise<void> {
    if (!pendingJobInputImport) {
      return;
    }

    if (!activeTemplate) {
      setJobActionError("Load a workflow template before importing inputs.");
      return;
    }

    if (!editorApi) {
      setJobActionError("Input editor is not ready yet.");
      return;
    }

    setIsImportingJobInputs(true);
    try {
      const result = await editorApi.applyImportedWorkflowInputs(pendingJobInputImport.sourceWorkflowRawJson, selectedJobInputCategories);
      if (!result.ok) {
        setJobActionError(result.reason);
        return;
      }

      setJobActionError("");
      setPendingJobInputImport(null);
      setSelectedJobInputCategories([]);
      setActiveTab("input");
    } finally {
      setIsImportingJobInputs(false);
    }
  }

  async function onImportInputs(sourceWorkflowRawJson: unknown, selectedCategories: string[]): Promise<
    | {
        ok: true;
        draftValues: DynamicInputDraftValues;
        matchedControls: number;
        selectedCategories: string[];
      }
    | {
        ok: false;
        reason: string;
      }
  > {
    if (!activeTemplate) {
      return {
        ok: false,
        reason: "Load a workflow template before importing inputs."
      };
    }

    if (!editorApi) {
      return {
        ok: false,
        reason: "Input editor is not ready yet."
      };
    }

    const result = await editorApi.applyImportedWorkflowInputs(sourceWorkflowRawJson, selectedCategories);
    if (!result.ok) {
      return result;
    }

    setActiveTab("input");

    return result;
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

  async function onClearImageCache(): Promise<void> {
    setIsClearingCache(true);
    setClearCacheStatus("Clearing image cache...");

    try {
      const removed = await clearImageCache();
      setClearCacheStatus(`Cleared ${removed} cached image${removed === 1 ? "" : "s"}. Images will reload from the server.`);
    } catch (error) {
      setClearCacheStatus(`Clear failed: ${error instanceof Error ? error.message : "Unexpected error"}`);
    } finally {
      setIsClearingCache(false);
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

    const serverInputs = await getJobInputs(jobId);
    const workflowPayload = toWorkflowExportPayload(serverInputs?.submittedInput ?? job.provenance.submittedInput);
    if (!workflowPayload) {
      setJobActionError("This job does not include an exportable workflow payload.");
      return;
    }

    const sanitizedWorkflowPayload = sanitizeWorkflowForExport(workflowPayload);
    const fileBase = sanitizeFileNamePart(job.provenance.workflowFileName ?? "workflow").replace(/\.json$/i, "");
    const fileName = `${fileBase}-${sanitizeFileNamePart(formatOutputJobId(job.jobId))}-populated.json`;
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
    <>
    <AppShell
      tabs={appTabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      headerRowOne={
        <>
          <h1>{`Chara2IMG Web ${APP_VERSION_LABEL}`}</h1>
          <div className="app-header-right">
            <button className="btn btn-secondary" type="button" onClick={() => setActiveTab("admin")}>
              Admin
            </button>
          </div>
        </>
      }
      headerRowTwo={
        <>
          <span>{`Runpod key: ${runpodKey || hasServerRunpodApiKey ? "Configured" : "Missing"}`}</span>
          <span>{`Endpoint: ${runEndpointId || "Not set"}`}</span>
          <span>{`Template: ${activeTemplate ? "Loaded" : "Not loaded"}`}</span>
          <span>{storageStatus}</span>
        </>
      }
      panels={{
        input: (
          <div className="section-stack">
            <details className="workflow-controls" aria-label="Workflow controls" >
              <summary>Workflow controls</summary>
              <div style={{ padding: "0.5rem 0" }}>
                <ActiveWorkflowTemplate
                  activeTemplate={activeTemplate}
                  recentTemplates={recentTemplates}
                  isLoading={isLoading}
                  error={error}
                  onSwitchTemplate={(template) => {
                    void persistTemplate(template);
                  }}
                  onRemoveRecentTemplate={(fingerprint) => {
                    void removeRecentTemplate(fingerprint);
                  }}
                  onClear={() => {
                    void clearTemplate();
                  }}
                />
                <WorkflowImport onImported={persistTemplate} onImportInputs={onImportInputs} currentTemplate={activeTemplate} />
              </div>
            </details>
            <p>Workflow template loaded: {activeTemplate ? "Yes" : "No"}</p>
            {activeTemplate ? (
              <DynamicInputEditor
                activeTemplate={activeTemplate}
                isActive={activeTab === "input"}
                isSubmitting={isSubmittingRun}
                onRunPayloadBuilt={onRunPayloadBuilt}
                onEditorReady={(api) => setEditorApi(api)}
              />
            ) : (
              <p>Import a workflow using the Workflow controls above before editing inputs.</p>
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
              onRerun={(jobId) => void handleRerun(jobId)}
              onLoadInputs={(jobId) => void onLoadInputs(jobId)}
              onExportWorkflow={(jobId) => void onExportWorkflow(jobId)}
              onRemoveVisible={(jobId) => void recentJobs.removeVisibleJob(jobId)}
              onViewOutputs={(jobId) => {
                navigate({ tab: "output", jobId }, "push");
              }}
              formatSubmittedAtRelative={formatSubmittedAtRelative}
              lastFetchedAt={recentJobs.lastFetchedAt}
            />
          </div>
        ),
        output: (
          <OutputsTab
            active={activeTab === "output"}
            clusters={recentJobs.completedOutputClusters}
            onLoadOutputCluster={(jobId) => recentJobs.loadOutputCluster(jobId)}
            onRerun={(jobId) => void handleRerun(jobId)}
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
            pinningImageKeys={recentJobs.pinningImageKeys}
            img2imgInputAvailable={Boolean(editorApi?.img2imgInputAvailable)}
            onLoadImageIntoImg2Img={(imageUrl) => void onLoadImageIntoImg2Img(imageUrl)}
            albumStarContext={albumStarContext}
          />
        ),
        albums: (
          <AlbumsTab
            albums={albums.albums}
            isLoading={albums.isLoading}
            error={albums.error}
            selectedAlbumId={route.albumId}
            onSelectAlbum={(albumId) => navigate({ tab: "albums", albumId }, "push")}
            onUpdateAlbum={albums.updateAlbum}
            onDeleteAlbum={albums.deleteAlbum}
            onRemoveImage={albums.removeImageFromAlbum}
            onViewJob={(jobId) => navigate({ tab: "output", jobId }, "push")}
            onTogglePinImage={async (jobId, imageIndex, pinned) => {
              const result = await recentJobs.togglePinnedImage(jobId, imageIndex, pinned);
              if (result.ok) {
                await albums.refresh();
              } else {
                setJobActionError(result.reason);
              }
              return { ok: result.ok };
            }}
          />
        ),
        admin: (
          <div className="section-stack">
            {hasServerRunpodApiKey ? (
              <section className="setup-card">
                <h2>Runpod API Key</h2>
                <p>Managed by pod environment variable `SERVER_RUNPOD_API_KEY`.</p>
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
            <section className="setup-card">
              <h2>Admin Maintenance</h2>
              <p>Use this section for privileged operations.</p>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn btn-secondary" type="button" onClick={() => void onUpdateApp()} disabled={isUpdatingApp}>
                  {isUpdatingApp ? "Updating..." : "Update App"}
                </button>
                {updateStatus ? <span>{updateStatus}</span> : null}
              </div>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn btn-secondary" type="button" onClick={() => void onClearImageCache()} disabled={isClearingCache}>
                  {isClearingCache ? "Clearing..." : "Clear Image Cache"}
                </button>
                {clearCacheStatus ? <span>{clearCacheStatus}</span> : null}
              </div>
            </section>
            <AdminTab enabled={adminGranted} />
            {!adminGranted ? <AdminGate onGranted={setAdminGranted} /> : null}
          </div>
        )
      }}
    />
      {pendingJobInputImport ? (
        <div className="workflow-import-dialog" role="dialog" aria-modal="true" aria-label="Import inputs from job dialog">
          <div className="workflow-import-dialog-card card">
            <h2>Import Inputs from {pendingJobInputImport.sourceTemplateName}</h2>
            <p>Select the source categories to map into the currently loaded Inputs tab.</p>
            <div className="workflow-import-category-list">
              {pendingJobInputImport.categories.map((entry) => {
                const checked = selectedJobInputCategories.includes(entry.category);
                return (
                  <label key={entry.category} className="workflow-import-category-item">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        const nextChecked = event.target.checked;
                        setSelectedJobInputCategories((current) => {
                          const currentSet = new Set(current);
                          if (nextChecked) {
                            currentSet.add(entry.category);
                          } else {
                            currentSet.delete(entry.category);
                          }
                          return pendingJobInputImport.categories.map((categoryEntry) => categoryEntry.category).filter((category) => currentSet.has(category));
                        });
                      }}
                    />
                    <span>{entry.category}</span>
                    <span className="workflow-import-category-count">{entry.controlCount}</span>
                  </label>
                );
              })}
            </div>
            <div className="workflow-import-dialog-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setSelectedJobInputCategories(pendingJobInputImport.categories.map((entry) => entry.category))}>
                Select all
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setSelectedJobInputCategories([])}>
                Select none
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setPendingJobInputImport(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="button" onClick={() => void confirmJobInputImport()} disabled={isImportingJobInputs || selectedJobInputCategories.length === 0}>
                {isImportingJobInputs ? "Importing..." : "Import selected"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </>
  );
}

