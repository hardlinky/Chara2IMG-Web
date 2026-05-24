import { useMemo, useState } from "react";
import type { WorkflowTemplateRecord } from "../../../shared/contracts/workflow";
import { importWorkflowFromText } from "../../../shared/workflow/importWorkflow";

type WorkflowImportProps = {
  onImported: (template: WorkflowTemplateRecord) => void;
};

export function WorkflowImport({ onImported }: WorkflowImportProps) {
  const [status, setStatus] = useState<string>("No workflow imported yet.");
  const [activeTemplate, setActiveTemplate] = useState<WorkflowTemplateRecord | null>(null);

  const nonBlockingIssues = useMemo(() => {
    if (!activeTemplate) {
      return [];
    }

    return activeTemplate.validation.issues;
  }, [activeTemplate]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const fileText = await file.text();
    const result = importWorkflowFromText(fileText, file.name);

    if (!result.ok) {
      setActiveTemplate(null);
      setStatus(`Import failed: ${result.error.message}`);
      return;
    }

    setActiveTemplate(result.template);
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
      <p className="status-inline" data-tone="success">{status}</p>
      {activeTemplate ? (
        <div className="setup-meta">
          <p>Fingerprint: {activeTemplate.fingerprint}</p>
          <p>Shape valid: {activeTemplate.validation.shapeValid ? "Yes" : "No"}</p>
          <p>Template valid: {activeTemplate.validation.templateValid ? "Yes" : "No"}</p>
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
