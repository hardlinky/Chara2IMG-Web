import { z } from "zod";
import type { WorkflowValidationIssue } from "../contracts/workflow";

const workflowNodeSchema = z.object({
  class_type: z.string(),
  inputs: z.record(z.string(), z.unknown()).optional()
});

const comfyUiWorkflowSchema = z.record(z.string(), workflowNodeSchema);

function toPath(path: PropertyKey[]): string {
  if (path.length === 0) {
    return "workflow";
  }

  return path.map((part) => String(part)).join(".");
}

export function validateWorkflowShape(rawWorkflow: unknown): WorkflowValidationIssue[] {
  const parsed = comfyUiWorkflowSchema.safeParse(rawWorkflow);

  if (parsed.success) {
    return [];
  }

  return parsed.error.issues.map((issue) => ({
    stage: "shape",
    code: issue.code,
    message: issue.message,
    path: toPath(issue.path)
  }));
}

export function validateWorkflowTemplateRules(rawWorkflow: unknown): WorkflowValidationIssue[] {
  const parsed = comfyUiWorkflowSchema.safeParse(rawWorkflow);

  if (!parsed.success) {
    return [
      {
        stage: "template",
        code: "template-rules-skipped",
        message: "Template rules skipped because workflow shape is invalid."
      }
    ];
  }

  const nodes = Object.values(parsed.data);
  const hasInputNode = nodes.some((node) => {
    if (!node.inputs) {
      return false;
    }

    return Object.keys(node.inputs).length > 0;
  });

  if (!hasInputNode) {
    return [
      {
        stage: "template",
        code: "missing-input-node",
        message: "Workflow must contain at least one node with inputs for template reuse."
      }
    ];
  }

  return [];
}
