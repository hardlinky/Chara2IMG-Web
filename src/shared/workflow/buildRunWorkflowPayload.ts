import type {
  DynamicInputBuildPayloadResult,
  DynamicInputControl,
  DynamicInputDraftValues,
  DynamicInputInlineError
} from "../contracts/inputs";

type BuildRunWorkflowPayloadArgs = {
  templateRawJson: unknown;
  controls: DynamicInputControl[];
  draftValues: DynamicInputDraftValues;
};

function cloneWorkflow(templateRawJson: unknown): Record<string, unknown> | null {
  if (!templateRawJson || typeof templateRawJson !== "object" || Array.isArray(templateRawJson)) {
    return null;
  }

  return structuredClone(templateRawJson) as Record<string, unknown>;
}

function getNodeInputs(payload: Record<string, unknown>, nodeId: string): Record<string, unknown> | null {
  const node = payload[nodeId];
  if (!node || typeof node !== "object") {
    return null;
  }

  const maybeInputs = (node as { inputs?: unknown }).inputs;
  if (!maybeInputs || typeof maybeInputs !== "object" || Array.isArray(maybeInputs)) {
    return null;
  }

  return maybeInputs as Record<string, unknown>;
}

function applyControlValue(
  inputs: Record<string, unknown>,
  control: DynamicInputControl,
  draftValues: DynamicInputDraftValues
): DynamicInputInlineError | null {
  const nextValue = draftValues[control.id] ?? control.defaultValue;

  if (control.kind === "dimension") {
    const widthField = control.source.valuePath[0];
    const heightField = control.source.valuePath[1];

    if (!widthField || !heightField || !(widthField in inputs) || !(heightField in inputs)) {
      return {
        controlId: control.id,
        message: `${control.name} could not map to workflow width/height fields.`
      };
    }

    if (!nextValue || typeof nextValue !== "object" || !("width" in nextValue) || !("height" in nextValue)) {
      return {
        controlId: control.id,
        message: `${control.name} has an invalid dimension value.`
      };
    }

    inputs[widthField] = Number(nextValue.width);
    inputs[heightField] = Number(nextValue.height);
    return null;
  }

  const field = control.source.valuePath[0];
  if (!field || !(field in inputs)) {
    return {
      controlId: control.id,
      message: `${control.name} could not map to a workflow field.`
    };
  }

  if (control.kind === "image") {
    if (nextValue && typeof nextValue === "object" && "dataUrl" in nextValue) {
      inputs[field] = String(nextValue.dataUrl);
    } else {
      inputs[field] = "";
    }

    return null;
  }

  if (control.kind === "lora-row") {
    const currentRow = inputs[field];
    if (!currentRow || typeof currentRow !== "object" || Array.isArray(currentRow)) {
      return {
        controlId: control.id,
        message: `${control.name} could not map to a lora row object.`
      };
    }

    if (!nextValue || typeof nextValue !== "object" || !("enabled" in nextValue) || !("strength" in nextValue) || !("loraName" in nextValue)) {
      return {
        controlId: control.id,
        message: `${control.name} has an invalid lora row value.`
      };
    }

    inputs[field] = {
      ...(currentRow as Record<string, unknown>),
      on: Boolean(nextValue.enabled),
      strength: Number(nextValue.strength)
    };

    return null;
  }

  inputs[field] = nextValue;
  return null;
}

export function buildRunWorkflowPayload(args: BuildRunWorkflowPayloadArgs): DynamicInputBuildPayloadResult {
  const payload = cloneWorkflow(args.templateRawJson);

  if (!payload) {
    return {
      ok: false,
      errors: [
        {
          controlId: "workflow",
          message: "Canonical workflow template is invalid."
        }
      ]
    };
  }

  const errors: DynamicInputInlineError[] = [];

  for (const control of args.controls) {
    const inputs = getNodeInputs(payload, control.source.nodeId);
    if (!inputs) {
      errors.push({
        controlId: control.id,
        message: `${control.name} points to a missing workflow node.`
      });
      continue;
    }

    const maybeError = applyControlValue(inputs, control, args.draftValues);
    if (maybeError) {
      errors.push(maybeError);
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors
    };
  }

  return {
    ok: true,
    payload
  };
}
