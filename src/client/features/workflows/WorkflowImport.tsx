import { useMemo, useState } from "react";
import type { WorkflowTemplateRecord } from "../../../shared/contracts/workflow";
import { importWorkflowFromText } from "../../../shared/workflow/importWorkflow";

type WorkflowImportProps = {
  onImported: (template: WorkflowTemplateRecord) => void;
  currentTemplate: WorkflowTemplateRecord | null;
};

export function WorkflowImport({ onImported, currentTemplate }: WorkflowImportProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [importedTemplate, setImportedTemplate] = useState<WorkflowTemplateRecord | null>(null);

  const displayTemplate = importedTemplate ?? currentTemplate;

  const statusText =
    status ??
    (currentTemplate
      ? `Active template loaded: ${currentTemplate.displayName}.`
      : "No workflow imported yet.");

  const nonBlockingIssues = useMemo(() => {
    if (!displayTemplate) {
      return [];
    }

    return displayTemplate.validation.issues;
  }, [displayTemplate]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const fileText = await file.text();
    const result = importWorkflowFromText(fileText, file.name);

    if (!result.ok) {
      setImportedTemplate(null);
      setStatus(`Import failed: ${result.error.message}`);
      return;
    }

    setImportedTemplate(result.template);
    onImported(result.template);

    const shapeText = result.template.validation.shapeValid ? "valid" : "issues found";
    const templateText = result.template.validation.templateValid ? "valid" : "issues found";

    setStatus(
      `Imported ${result.template.displayName}. Shape check: ${shapeText}. Template rules: ${templateText}.`
    );
  }

  return (
    <section className="setup-card">
      <h2>Workflow Import</h2>
      <p>Upload a ComfyUI workflow JSON template to reuse it for later runs.</p>
      <div className="setup-form">
        <input className="input" type="file" accept=".json,application/json" onChange={handleFileChange} />
      </div>
      <p className="status-inline" data-tone="success">{statusText}</p>
      {displayTemplate ? (
        <div className="setup-meta">
          <p>Fingerprint: {displayTemplate.fingerprint}</p>
          <p>Shape valid: {displayTemplate.validation.shapeValid ? "Yes" : "No"}</p>
          <p>Template valid: {displayTemplate.validation.templateValid ? "Yes" : "No"}</p>
          {nonBlockingIssues.length > 0 ? (
            <ul>
              {nonBlockingIssues.map((issue) => (
                <li key={`${issue.stage}-${issue.code}-${issue.path ?? "root"}`}>
                  [{issue.stage}] {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
