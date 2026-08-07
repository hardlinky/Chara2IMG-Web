import { useEffect, useState } from "react";
import type { WorkflowTemplateRecord } from "../../../shared/contracts/workflow";
import { importWorkflowFromText } from "../../../shared/workflow/importWorkflow";
import { confirmDeletion } from "../../lib/confirmDelete";

type ActiveWorkflowTemplateProps = {
  activeTemplate: WorkflowTemplateRecord | null;
  recentTemplates: WorkflowTemplateRecord[];
  isLoading: boolean;
  error: string | null;
  onClear: () => void;
  onSwitchTemplate: (template: WorkflowTemplateRecord) => void;
  onRemoveRecentTemplate: (fingerprint: string) => void;
  onImported: (template: WorkflowTemplateRecord) => void;
};

export function ActiveWorkflowTemplate({
  activeTemplate,
  recentTemplates,
  isLoading,
  error,
  onClear,
  onSwitchTemplate,
  onRemoveRecentTemplate,
  onImported
}: ActiveWorkflowTemplateProps) {
  const [stockWorkflows, setStockWorkflows] = useState<string[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/workflows", { credentials: "include" })
      .then((r) => r.json())
      .then((d: unknown) => {
        const list = (d as { workflows?: string[] }).workflows;
        setStockWorkflows(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
  }, []);

  async function handleLoadStock(filename: string): Promise<void> {
    if (!filename) return;
    setLoadingStock(true);
    setStockError(null);
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(filename)}`, { credentials: "include" });
      if (!res.ok) { setStockError(`Failed to load ${filename}`); return; }
      const text = await res.text();
      const result = importWorkflowFromText(text, filename);
      if (!result.ok) { setStockError(`Import error: ${result.error.message}`); return; }
      onImported(result.template);
    } catch {
      setStockError(`Failed to load ${filename}`);
    } finally {
      setLoadingStock(false);
    }
  }
  const stockDropdown = stockWorkflows.length > 0 ? (
    <div className="setup-meta">
      <h3>Stock Workflows</h3>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <select
          className="select"
          defaultValue=""
          disabled={loadingStock}
          onChange={(e) => void handleLoadStock(e.target.value)}
          style={{ flex: "1 1 0" }}
        >
          <option value="" disabled>{loadingStock ? "Loading…" : "Select a stock workflow…"}</option>
          {stockWorkflows.map((name) => (
            <option key={name} value={name}>{name.replace(/\.json$/i, "")}</option>
          ))}
        </select>
      </div>
      {stockError && <p className="status-inline" data-tone="error">{stockError}</p>}
    </div>
  ) : null;

  if (isLoading) {
    return (
      <section className="setup-card">
        <h2>Active Workflow Template</h2>
        <p>Loading active template...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="setup-card">
        <h2>Active Workflow Template</h2>
        <p className="status-inline" data-tone="error">Template restore failed: {error}</p>
      </section>
    );
  }

  if (!activeTemplate) {
    return (
      <section className="setup-card">
        <h2>Active Workflow Template</h2>
        {stockDropdown}
        <p>No active template saved yet.</p>
      </section>
    );
  }

  return (
    <section className="setup-card">
      {recentTemplates.length > 1 ? (
        <div className="setup-meta">
          <h3>Recent Workflows</h3>
          <div className="setup-stack">
            {recentTemplates
              .filter((template) => template.fingerprint !== activeTemplate.fingerprint)
              .map((template) => (
                <div key={template.fingerprint} className="recent-workflow-item">
                  <button
                    className="btn btn-secondary recent-workflow-switch-btn"
                    type="button"
                    onClick={() => onSwitchTemplate(template)}
                  >
                    {template.displayName}
                  </button>
                  <button
                    className="btn btn-destructive"
                    type="button"
                    onClick={() => {
                      void confirmDeletion({ message: `Remove "${template.displayName}" from recent workflows?`, confirmLabel: "Remove" }).then((ok) => {
                        if (ok) onRemoveRecentTemplate(template.fingerprint);
                      });
                    }}
                    aria-label={`Remove ${template.displayName} from recent workflows`}
                    title={`Remove ${template.displayName} from recent workflows`}
                  >
                    Remove
                  </button>
                </div>
              ))}
          </div>
        </div>
      ) : null}
      {stockDropdown}
      <h2>Active Workflow Template</h2>
      <div className="setup-meta">
        <p>Name: {activeTemplate.displayName}</p>
        <p>Fingerprint: {activeTemplate.fingerprint}</p>
        <p>Imported at: {new Date(activeTemplate.importedAt).toLocaleString()}</p>
        <p>Shape valid: {activeTemplate.validation.shapeValid ? "Yes" : "No"}</p>
        <p>Template valid: {activeTemplate.validation.templateValid ? "Yes" : "No"}</p>
      </div>
      <div className="setup-actions">
        <button className="btn btn-destructive" type="button" onClick={onClear}>
          Clear active template
        </button>
      </div>
    </section>
  );
}
