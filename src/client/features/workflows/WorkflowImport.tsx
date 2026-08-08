import { type ChangeEvent, useMemo, useState } from "react";
import type { DynamicInputDraftValues } from "../../../shared/contracts/inputs";
import type { WorkflowTemplateRecord } from "../../../shared/contracts/workflow";
import { deriveInputControls } from "../../../shared/workflow/deriveInputControls";
import { importWorkflowFromText } from "../../../shared/workflow/importWorkflow";
import { WorkflowInfoButton } from "./WorkflowInfoButton";

type WorkflowImportProps = {
  onImported: (template: WorkflowTemplateRecord) => void;
  onImportInputs: (sourceWorkflowRawJson: unknown, selectedCategories: string[]) => Promise<
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
  currentTemplate: WorkflowTemplateRecord | null;
};

type PendingInputImport = {
  sourceWorkflowRawJson: unknown;
  sourceTemplateName: string;
  categories: Array<{
    category: string;
    controlCount: number;
  }>;
};

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

export function WorkflowImport({ onImported, onImportInputs, currentTemplate }: WorkflowImportProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [importedTemplate, setImportedTemplate] = useState<WorkflowTemplateRecord | null>(null);
  const [pendingInputImport, setPendingInputImport] = useState<PendingInputImport | null>(null);
  const [selectedInputCategories, setSelectedInputCategories] = useState<string[]>([]);
  const [isImportingInputs, setIsImportingInputs] = useState(false);

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

  const workflowDetails = displayTemplate
    ? `Upload a ComfyUI workflow JSON template to reuse for later runs.\nCurrent: ${displayTemplate.displayName}\nFingerprint: ${displayTemplate.fingerprint}\nShape valid: ${displayTemplate.validation.shapeValid ? "Yes" : "No"}\nTemplate valid: ${displayTemplate.validation.templateValid ? "Yes" : "No"}${nonBlockingIssues.length > 0 ? `\nIssues: ${nonBlockingIssues.map((issue) => issue.message).join("; ")}` : ""}`
    : "Upload a ComfyUI workflow JSON template to reuse for later runs.";

  const pendingCategories = pendingInputImport?.categories ?? [];

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
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

  async function handleInputsFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const fileText = await file.text();
    const result = importWorkflowFromText(fileText, file.name);

    if (!result.ok) {
      setPendingInputImport(null);
      setSelectedInputCategories([]);
      setStatus(`Input import failed: ${result.error.message}`);
      event.currentTarget.value = "";
      return;
    }

    const sourceWorkflow = normalizeWorkflowSource(result.template.rawJson);
    const derivation = deriveInputControls(sourceWorkflow);
    const categories = derivation.sections.map((section) => ({
      category: section.category,
      controlCount: section.controlIds.length
    }));

    if (categories.length === 0) {
      setPendingInputImport(null);
      setSelectedInputCategories([]);
      setStatus(`No importable input categories were found in ${result.template.displayName}.`);
      event.currentTarget.value = "";
      return;
    }

    setPendingInputImport({
      sourceWorkflowRawJson: result.template.rawJson,
      sourceTemplateName: result.template.displayName,
      categories
    });
    setSelectedInputCategories(categories.map((entry) => entry.category));
    setStatus(`Choose the input categories to import from ${result.template.displayName}.`);
    event.currentTarget.value = "";
  }

  async function confirmInputImport() {
    if (!pendingInputImport) {
      return;
    }

    if (!currentTemplate) {
      setStatus("Load a workflow template before importing inputs.");
      return;
    }

    setIsImportingInputs(true);
    try {
      const sourceTemplateName = pendingInputImport.sourceTemplateName;
      const result = await onImportInputs(pendingInputImport.sourceWorkflowRawJson, selectedInputCategories);
      if (!result.ok) {
        setStatus(`Input import failed: ${result.reason}`);
        return;
      }

      setPendingInputImport(null);
      setSelectedInputCategories([]);
      setStatus(
        `Imported inputs from ${sourceTemplateName}. Populated ${result.matchedControls} control${result.matchedControls === 1 ? "" : "s"} across ${result.selectedCategories.length} selected categor${result.selectedCategories.length === 1 ? "y" : "ies"}.`
      );
    } finally {
      setIsImportingInputs(false);
    }
  }

  return (
    <section className="setup-card">
      <div className="workflow-heading">
        <h2>Workflow Import</h2>
        <WorkflowInfoButton label="About workflow import" tooltip={workflowDetails} />
      </div>
      <div className="setup-form">
        <input className="input" type="file" accept=".json,application/json" onChange={handleFileChange} />
      </div>
      {status ? <p className="status-inline" data-tone="success">{statusText}</p> : null}
      <div className="setup-stack">
        <div className="workflow-heading">
          <h3>Import Inputs</h3>
          <WorkflowInfoButton
            label="About input import"
            tooltip="Pick a workflow JSON file, then choose which source categories to map into the active Inputs tab."
          />
        </div>
        <div className="setup-form">
          <input className="input" type="file" accept=".json,application/json" onChange={handleInputsFileChange} />
        </div>
      </div>
      {pendingInputImport ? (
        <div className="workflow-import-dialog" role="dialog" aria-modal="true" aria-label="Import inputs dialog">
          <div className="workflow-import-dialog-card card">
            <h3>Choose categories from {pendingInputImport.sourceTemplateName}</h3>
            <p>The selection below controls which source inputs will be mapped into the current Inputs tab.</p>
            {!currentTemplate ? <p className="status-inline" data-tone="warning">Load a workflow template first so the imported values have somewhere to go.</p> : null}
            <div className="workflow-import-category-list">
              {pendingCategories.map((entry) => {
                const checked = selectedInputCategories.includes(entry.category);
                return (
                  <label key={entry.category} className="workflow-import-category-item">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        const nextChecked = event.target.checked;
                        setSelectedInputCategories((current) => {
                          const currentSet = new Set(current);
                          if (nextChecked) {
                            currentSet.add(entry.category);
                          } else {
                            currentSet.delete(entry.category);
                          }
                          return pendingCategories.map((categoryEntry) => categoryEntry.category).filter((category) => currentSet.has(category));
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
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setSelectedInputCategories(pendingCategories.map((entry) => entry.category))}
              >
                Select all
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setSelectedInputCategories([])}
              >
                Select none
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setPendingInputImport(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => void confirmInputImport()}
                disabled={isImportingInputs || selectedInputCategories.length === 0 || !currentTemplate}
              >
                {isImportingInputs ? "Importing..." : "Import selected"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
