import type {
  DynamicInputControl,
  DynamicInputDraftValues,
  DynamicInputInlineValidationResult,
  DynamicInputRunValidationResult,
  DynamicInputValue
} from "../contracts/inputs";
import { validateSectionNames } from "../../client/features/inputs/inputVariables";

function decimalPlaces(value: number): number {
  const valueText = String(value);
  const dotIndex = valueText.indexOf(".");
  if (dotIndex < 0) {
    return 0;
  }

  return valueText.length - dotIndex - 1;
}

function validateRequired(control: DynamicInputControl, value: DynamicInputValue): string | null {
  if (!control.constraints.required) {
    return null;
  }

  if (control.kind === "image") {
    if (!value || typeof value !== "object" || !("dataUrl" in value) || !String(value.dataUrl)) {
      return `${control.name} needs an image before running.`;
    }
    return null;
  }

  if ((control.kind === "text" || control.kind === "multiline") && String(value ?? "").trim().length === 0) {
    return `${control.name} is required.`;
  }

  if (control.kind === "dimension") {
    if (!value || typeof value !== "object" || !("width" in value) || !("height" in value)) {
      return `${control.name} must include width and height.`;
    }
  }

  return null;
}

function validateNumberConstraints(control: DynamicInputControl, value: number): string | null {
  if (!Number.isFinite(value)) {
    return `${control.name} must be a valid number.`;
  }

  if (control.constraints.min !== undefined && value < control.constraints.min) {
    return `${control.name} must be at least ${control.constraints.min}.`;
  }

  if (control.constraints.max !== undefined && value > control.constraints.max) {
    return `${control.name} must be at most ${control.constraints.max}.`;
  }

  if (control.constraints.precision !== undefined && decimalPlaces(value) > control.constraints.precision) {
    return `${control.name} supports up to ${control.constraints.precision} decimal places.`;
  }

  return null;
}

export function validateInlineControl(
  control: DynamicInputControl,
  value: DynamicInputValue,
  enforceRunRules: boolean = false
): DynamicInputInlineValidationResult {
  const requiredError = validateRequired(control, value);
  if (requiredError) {
    return {
      valid: false,
      errors: [
        {
          controlId: control.id,
          message: requiredError
        }
      ]
    };
  }

  if (control.kind === "number") {
    if (value === "") {
      if (enforceRunRules) {
        return {
          valid: false,
          errors: [
            {
              controlId: control.id,
              message: `${control.name} must be numeric.`
            }
          ]
        };
      }

      return {
        valid: true,
        errors: []
      };
    }

    if (typeof value !== "number") {
      return {
        valid: false,
        errors: [
          {
            controlId: control.id,
            message: `${control.name} must be numeric.`
          }
        ]
      };
    }

    const error = validateNumberConstraints(control, value);
    if (error) {
      return {
        valid: false,
        errors: [
          {
            controlId: control.id,
            message: error
          }
        ]
      };
    }
  }

  if (control.kind === "lora-row") {
    if (!value || typeof value !== "object" || !("strength" in value) || !("enabled" in value) || !("loraName" in value)) {
      return {
        valid: false,
        errors: [
          {
            controlId: control.id,
            message: `${control.name} has an invalid lora row value.`
          }
        ]
      };
    }

    if (typeof value.loraName !== "string" || value.loraName.trim().length === 0) {
      return {
        valid: false,
        errors: [
          {
            controlId: control.id,
            message: `${control.name} must have a lora name.`
          }
        ]
      };
    }

    const error = validateNumberConstraints(control, Number(value.strength));
    if (error) {
      return {
        valid: false,
        errors: [
          {
            controlId: control.id,
            message: error.replace(control.name, `${control.name} strength`)
          }
        ]
      };
    }
  }

  if (control.kind === "dimension") {
    if (!value || typeof value !== "object" || !("width" in value) || !("height" in value)) {
      return {
        valid: false,
        errors: [
          {
            controlId: control.id,
            message: `${control.name} requires width and height numbers.`
          }
        ]
      };
    }

    const widthError = validateNumberConstraints(control, Number(value.width));
    if (widthError) {
      return {
        valid: false,
        errors: [
          {
            controlId: control.id,
            message: widthError.replace(control.name, `${control.name} width`)
          }
        ]
      };
    }

    const heightError = validateNumberConstraints(control, Number(value.height));
    if (heightError) {
      return {
        valid: false,
        errors: [
          {
            controlId: control.id,
            message: heightError.replace(control.name, `${control.name} height`)
          }
        ]
      };
    }
  }

  return {
    valid: true,
    errors: []
  };
}

export function validateDraftForRun(
  controls: DynamicInputControl[],
  draftValues: DynamicInputDraftValues
): DynamicInputRunValidationResult {
  const errors = controls.flatMap((control) => {
    const candidate = draftValues[control.id] ?? control.defaultValue;
    return validateInlineControl(control, candidate, true).errors;
  });

  const nameErrors = validateSectionNames(controls, draftValues);
  for (const [controlId, message] of Object.entries(nameErrors)) {
    errors.push({
      controlId,
      message
    });
  }

  if (errors.length === 0) {
    return {
      valid: true,
      errors: []
    };
  }

  return {
    valid: false,
    errors,
    blockingMessage: "Fix highlighted inputs before running the workflow."
  };
}

export function shouldPersistDraftValue(control: DynamicInputControl, value: DynamicInputValue): boolean {
  if (control.kind === "text" || control.kind === "multiline") {
    return true;
  }

  return validateInlineControl(control, value).valid;
}
