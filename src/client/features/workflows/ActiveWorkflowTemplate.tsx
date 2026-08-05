import type { WorkflowTemplateRecord } from "../../../shared/contracts/workflow";
import { confirmDeletion } from "../../lib/confirmDelete";

type ActiveWorkflowTemplateProps = {
  activeTemplate: WorkflowTemplateRecord | null;
  recentTemplates: WorkflowTemplateRecord[];
  isLoading: boolean;
  error: string | null;
  onClear: () => void;
  onSwitchTemplate: (template: WorkflowTemplateRecord) => void;
  onRemoveRecentTemplate: (fingerprint: string) => void;
};

export function ActiveWorkflowTemplate({
  activeTemplate,
  recentTemplates,
  isLoading,
  error,
  onClear,
  onSwitchTemplate,
  onRemoveRecentTemplate
}: ActiveWorkflowTemplateProps) {
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
