export type WorkflowValidationStage = "shape" | "template";

export type WorkflowValidationIssue = {
  stage: WorkflowValidationStage;
  code: string;
  message: string;
  path?: string;
};

export type WorkflowValidationState = {
  shapeValid: boolean;
  templateValid: boolean;
  issues: WorkflowValidationIssue[];
};

export type WorkflowTemplateRecord = {
  fingerprint: string;
  displayName: string;
  schemaVersion: "comfyui-v1";
  importedAt: string;
  rawText: string;
  rawJson: unknown;
  validation: WorkflowValidationState;
};

export type WorkflowImportSuccess = {
  ok: true;
  template: WorkflowTemplateRecord;
};

export type WorkflowImportFailure = {
  ok: false;
  error: {
    code: "invalid-json";
    message: string;
  };
};

export type WorkflowImportResult = WorkflowImportSuccess | WorkflowImportFailure;
