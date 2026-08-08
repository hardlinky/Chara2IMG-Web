import { useRef, useState } from "react";
import { importWorkflowFromText } from "../../../shared/workflow/importWorkflow";
import { uploadWorkflowTemplate } from "../../lib/api/adminWorkflowsClient";

const MAX_WORKFLOW_BYTES = 5 * 1024 * 1024;

type SelectedWorkflow = {
  filename: string;
  workflow: unknown;
};

export function WorkflowUploadsPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<SelectedWorkflow | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"error" | "success">("error");
  const [isUploading, setIsUploading] = useState(false);

  async function handleFile(file: File | undefined): Promise<void> {
    setSelected(null);
    setStatus("");
    if (!file) return;
    if (!/\.json$/i.test(file.name)) {
      setStatus("Choose a JSON workflow file.");
      return;
    }
    if (file.size > MAX_WORKFLOW_BYTES) {
      setStatus("Workflow file must be 5 MB or smaller.");
      return;
    }

    const result = importWorkflowFromText(await file.text(), file.name);
    if (!result.ok) {
      setStatus(`Invalid JSON: ${result.error.message}`);
      return;
    }
    if (!result.template.validation.shapeValid || !result.template.validation.templateValid) {
      setStatus(result.template.validation.issues[0]?.message ?? "Invalid ComfyUI workflow template.");
      return;
    }

    setSelected({ filename: file.name, workflow: result.template.rawJson });
  }

  async function handleUpload(): Promise<void> {
    if (!selected) return;
    setIsUploading(true);
    setStatus("");
    try {
      const result = await uploadWorkflowTemplate(selected.filename, selected.workflow, overwrite);
      if (!result.ok) {
        setStatusTone("error");
        setStatus(result.error);
        return;
      }

      setStatusTone("success");
      setStatus(`Uploaded "${result.filename}".`);
      setSelected(null);
      setOverwrite(false);
      if (inputRef.current) inputRef.current.value = "";
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <section className="setup-card">
      <h2>Workflow Templates</h2>
      <p>Upload a validated ComfyUI workflow to the stock templates on the network volume.</p>
      <div className="setup-form">
        <label className="field" htmlFor="admin-workflow-file">
          Workflow JSON
          <input
            ref={inputRef}
            className="input"
            id="admin-workflow-file"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(event) => setOverwrite(event.target.checked)}
          />{" "}
          Replace an existing template with the same filename
        </label>
        <div className="setup-actions">
          <button
            className="btn btn-primary"
            type="button"
            disabled={!selected || isUploading}
            onClick={() => void handleUpload()}
          >
            {isUploading ? "Uploading..." : "Upload template"}
          </button>
          {selected ? <span className="status-inline">Ready: {selected.filename}</span> : null}
        </div>
        {status ? <p className="status-inline" data-tone={statusTone}>{status}</p> : null}
      </div>
    </section>
  );
}