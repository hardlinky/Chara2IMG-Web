import type {
  WorkflowImportResult,
  WorkflowTemplateRecord,
  WorkflowValidationIssue,
  WorkflowValidationState
} from "../contracts/workflow";
import { validateWorkflowShape, validateWorkflowTemplateRules } from "./workflowSchemas";

function normalizeDisplayName(fileName?: string): string {
  if (!fileName) {
    return "Imported workflow";
  }

  return fileName.replace(/\.json$/i, "") || "Imported workflow";
}

function createFingerprint(rawText: string): string {
  let hash = 2166136261;

  for (let index = 0; index < rawText.length; index += 1) {
    hash ^= rawText.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `wf_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function buildValidationState(
  shapeIssues: WorkflowValidationIssue[],
  templateIssues: WorkflowValidationIssue[]
): WorkflowValidationState {
  return {
    shapeValid: shapeIssues.length === 0,
    templateValid: templateIssues.length === 0,
    issues: [...shapeIssues, ...templateIssues]
  };
}

export function importWorkflowFromText(rawText: string, fileName?: string): WorkflowImportResult {
  let rawJson: unknown;

  try {
    rawJson = JSON.parse(rawText);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";

    return {
      ok: false,
      error: {
        code: "invalid-json",
        message
      }
    };
  }

  const shapeIssues = validateWorkflowShape(rawJson);
  const templateIssues = validateWorkflowTemplateRules(rawJson);

  const template: WorkflowTemplateRecord = {
    fingerprint: createFingerprint(rawText),
    displayName: normalizeDisplayName(fileName),
    schemaVersion: "comfyui-v1",
    importedAt: new Date().toISOString(),
    rawText,
    rawJson,
    validation: buildValidationState(shapeIssues, templateIssues)
  };

  return {
    ok: true,
    template
  };
}
