import type { WorkflowTemplateRecord } from "../../../shared/contracts/workflow";

type ActiveWorkflowTemplateProps = {
  activeTemplate: WorkflowTemplateRecord | null;
  isLoading: boolean;
  error: string | null;
  onClear: () => void;
};

export function ActiveWorkflowTemplate({
  activeTemplate,
  isLoading,
  error,
  onClear
}: ActiveWorkflowTemplateProps) {
  if (isLoading) {
    return (
      <section>
        <h2>Active Workflow Template</h2>
        <p>Loading active template...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section>
        <h2>Active Workflow Template</h2>
        <p>Template restore failed: {error}</p>
      </section>
    );
  }

  if (!activeTemplate) {
    return (
      <section>
        <h2>Active Workflow Template</h2>
        <p>No active template saved yet.</p>
      </section>
    );
  }

  return (
    <section>
      <h2>Active Workflow Template</h2>
      <p>Name: {activeTemplate.displayName}</p>
      <p>Fingerprint: {activeTemplate.fingerprint}</p>
      <p>Imported at: {new Date(activeTemplate.importedAt).toLocaleString()}</p>
      <p>Shape valid: {activeTemplate.validation.shapeValid ? "Yes" : "No"}</p>
      <p>Template valid: {activeTemplate.validation.templateValid ? "Yes" : "No"}</p>
      <button type="button" onClick={onClear}>
        Clear active template
      </button>
    </section>
  );
}
