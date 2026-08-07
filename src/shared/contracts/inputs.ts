export type DynamicInputControlKind =
  | "text"
  | "multiline"
  | "number"
  | "boolean"
  | "dimension"
  | "image"
  | "lora-row"
  | "lora-list"
  | "checkpoint";

export type DynamicInputConstraint = {
  required?: boolean;
  min?: number;
  max?: number;
  precision?: number;
};

export type DynamicInputSourceMapping = {
  nodeId: string;
  titlePath: string;
  valuePath: string[];
};

export type DynamicInputControl = {
  id: string;
  kind: DynamicInputControlKind;
  inputIndex: number;
  fullTitle: string;
  category: string;
  name: string;
  source: DynamicInputSourceMapping;
  constraints: DynamicInputConstraint;
  defaultValue: DynamicInputValue;
  orderKey: string;
};

export type DynamicInputSection = {
  category: string;
  controlIds: string[];
};

export type DynamicInputWarningCode =
  | "invalid-title"
  | "disallowed-symbol"
  | "unsupported-kind"
  | "missing-editable-value"
  | "invalid-node-shape";

export type DynamicInputWarning = {
  code: DynamicInputWarningCode;
  nodeId: string;
  title?: string;
  message: string;
};

export type DynamicInputOrderingOverlay = {
  orderByControlId: Record<string, number>;
  sectionColumnByCategory?: Record<string, "left" | "right">;
  columnsSplitRatio?: number;
};

export type DynamicInputValue =
  | string
  | number
  | boolean
  | {
      width: number;
      height: number;
    }
  | {
      dataUrl: string;
    }
  | {
      enabled: boolean;
      loraName: string;
      strength: number;
    }
  | {
      loras: Array<{ loraName: string; strength: number }>;
    }
  | null;

export type DynamicInputDraftValues = Record<string, DynamicInputValue>;

export type DynamicInputInlineError = {
  controlId: string;
  message: string;
};

export type DynamicInputInlineValidationResult = {
  valid: boolean;
  errors: DynamicInputInlineError[];
};

export type DynamicInputRunValidationResult = {
  valid: boolean;
  errors: DynamicInputInlineError[];
  blockingMessage?: string;
};

export type DynamicInputRunValidationSummary = DynamicInputRunValidationResult & {
  attemptedAt: string;
};

export type DynamicInputDerivationResult = {
  controls: DynamicInputControl[];
  sections: DynamicInputSection[];
  warnings: DynamicInputWarning[];
};

export type DynamicInputBuildPayloadSuccess = {
  ok: true;
  payload: Record<string, unknown>;
};

export type DynamicInputBuildPayloadFailure = {
  ok: false;
  errors: DynamicInputInlineError[];
};

export type DynamicInputBuildPayloadResult =
  | DynamicInputBuildPayloadSuccess
  | DynamicInputBuildPayloadFailure;
