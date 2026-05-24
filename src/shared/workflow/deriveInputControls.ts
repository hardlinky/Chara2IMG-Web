import type {
  DynamicInputControl,
  DynamicInputControlKind,
  DynamicInputDerivationResult,
  DynamicInputWarning
} from "../contracts/inputs";

type WorkflowNode = {
  class_type: string;
  inputs?: Record<string, unknown>;
};

type InputMetadata = {
  kind?: string;
  field?: string;
  required?: boolean;
  min?: number;
  max?: number;
  precision?: number;
  widthField?: string;
  heightField?: string;
};

const TITLE_PREFIX = /^\[Input(\d+)\]\s*/;
const ALLOWED_TITLE = /^[\p{L}\p{N}\s._\-()]+$/u;

function parseNode(rawNode: unknown): WorkflowNode | null {
  if (!rawNode || typeof rawNode !== "object") {
    return null;
  }

  const node = rawNode as Partial<WorkflowNode>;
  if (typeof node.class_type !== "string") {
    return null;
  }

  if (node.inputs !== undefined && (typeof node.inputs !== "object" || Array.isArray(node.inputs))) {
    return null;
  }

  return {
    class_type: node.class_type,
    inputs: (node.inputs as Record<string, unknown> | undefined) ?? undefined
  };
}

function toKind(rawKind: string | undefined): DynamicInputControlKind | null {
  switch (rawKind) {
    case "text":
    case "multiline":
    case "number":
    case "boolean":
    case "dimension":
    case "image":
      return rawKind;
    default:
      return null;
  }
}

function parseTitle(title: string): { inputIndex: number; body: string } | null {
  const match = TITLE_PREFIX.exec(title);
  if (!match) {
    return null;
  }

  return {
    inputIndex: Number(match[1]),
    body: title.slice(match[0].length)
  };
}

function parseCategoryAndName(body: string): { category: string; name: string } {
  const dotIndex = body.indexOf(".");

  if (dotIndex <= 0 || dotIndex >= body.length - 1) {
    return {
      category: "Uncategorized",
      name: body.trim() || "Unnamed"
    };
  }

  const category = body.slice(0, dotIndex).trim();
  const name = body.slice(dotIndex + 1).trim();

  if (!category || !name) {
    return {
      category: "Uncategorized",
      name: body.trim() || "Unnamed"
    };
  }

  return {
    category,
    name
  };
}

function createControl(
  nodeId: string,
  title: string,
  parsedTitle: { inputIndex: number; body: string },
  metadata: InputMetadata,
  inputs: Record<string, unknown>
): DynamicInputControl | null {
  const kind = toKind(metadata.kind);
  if (!kind) {
    return null;
  }

  const valueField = metadata.field ?? "value";
  const categoryAndName = parseCategoryAndName(parsedTitle.body);

  if (kind === "dimension") {
    const widthField = metadata.widthField ?? "width";
    const heightField = metadata.heightField ?? "height";

    if (!(widthField in inputs) || !(heightField in inputs)) {
      return null;
    }

    return {
      id: `${nodeId}:dimension:${widthField}:${heightField}`,
      kind,
      inputIndex: parsedTitle.inputIndex,
      fullTitle: title,
      category: categoryAndName.category,
      name: categoryAndName.name,
      source: {
        nodeId,
        titlePath: `${nodeId}.inputs.title`,
        valuePath: [widthField, heightField]
      },
      constraints: {
        required: Boolean(metadata.required),
        min: metadata.min,
        max: metadata.max,
        precision: metadata.precision
      },
      defaultValue: {
        width: Number(inputs[widthField]),
        height: Number(inputs[heightField])
      },
      orderKey: `${parsedTitle.inputIndex.toString().padStart(6, "0")}:${title}`
    };
  }

  if (!(valueField in inputs)) {
    return null;
  }

  let defaultValue: DynamicInputControl["defaultValue"] = null;
  const value = inputs[valueField];

  switch (kind) {
    case "text":
    case "multiline":
      defaultValue = typeof value === "string" ? value : "";
      break;
    case "number":
      defaultValue = typeof value === "number" ? value : Number(value ?? 0);
      break;
    case "boolean":
      defaultValue = typeof value === "boolean" ? value : Boolean(value);
      break;
    case "image":
      defaultValue = typeof value === "string" && value ? { dataUrl: value } : null;
      break;
    default:
      break;
  }

  return {
    id: `${nodeId}:${kind}:${valueField}`,
    kind,
    inputIndex: parsedTitle.inputIndex,
    fullTitle: title,
    category: categoryAndName.category,
    name: categoryAndName.name,
    source: {
      nodeId,
      titlePath: `${nodeId}.inputs.title`,
      valuePath: [valueField]
    },
    constraints: {
      required: Boolean(metadata.required),
      min: metadata.min,
      max: metadata.max,
      precision: metadata.precision
    },
    defaultValue,
    orderKey: `${parsedTitle.inputIndex.toString().padStart(6, "0")}:${title}`
  };
}

export function deriveInputControls(rawWorkflow: unknown): DynamicInputDerivationResult {
  const controls: DynamicInputControl[] = [];
  const warnings: DynamicInputWarning[] = [];

  if (!rawWorkflow || typeof rawWorkflow !== "object" || Array.isArray(rawWorkflow)) {
    return {
      controls,
      sections: [],
      warnings: [
        {
          code: "invalid-node-shape",
          nodeId: "workflow",
          message: "Workflow shape is invalid and cannot be parsed for inputs."
        }
      ]
    };
  }

  for (const [nodeId, nodeValue] of Object.entries(rawWorkflow)) {
    const node = parseNode(nodeValue);
    if (!node) {
      warnings.push({
        code: "invalid-node-shape",
        nodeId,
        message: "Node is malformed and was skipped."
      });
      continue;
    }

    if (!node.inputs) {
      continue;
    }

    const title = node.inputs.title;
    const metadata = node.inputs.__input as InputMetadata | undefined;

    if (typeof title !== "string") {
      continue;
    }

    const parsedTitle = parseTitle(title);
    if (!parsedTitle) {
      continue;
    }

    if (!ALLOWED_TITLE.test(parsedTitle.body)) {
      warnings.push({
        code: "disallowed-symbol",
        nodeId,
        title,
        message: `Input title '${title}' contains unsupported symbols and was skipped.`
      });
      continue;
    }

    if (!metadata || typeof metadata !== "object") {
      warnings.push({
        code: "unsupported-kind",
        nodeId,
        title,
        message: `Input '${title}' is missing declared control metadata and was skipped.`
      });
      continue;
    }

    const kind = toKind(metadata.kind);
    if (!kind) {
      warnings.push({
        code: "unsupported-kind",
        nodeId,
        title,
        message: `Input '${title}' declares an unsupported control type and was skipped.`
      });
      continue;
    }

    const control = createControl(nodeId, title, parsedTitle, metadata, node.inputs);
    if (!control) {
      warnings.push({
        code: "missing-editable-value",
        nodeId,
        title,
        message: `Input '${title}' could not find its editable value field and was skipped.`
      });
      continue;
    }

    controls.push(control);
  }

  controls.sort((left, right) => {
    if (left.inputIndex !== right.inputIndex) {
      return left.inputIndex - right.inputIndex;
    }

    return left.fullTitle.localeCompare(right.fullTitle);
  });

  const sectionMap = new Map<string, string[]>();
  for (const control of controls) {
    const existing = sectionMap.get(control.category);
    if (existing) {
      existing.push(control.id);
      continue;
    }

    sectionMap.set(control.category, [control.id]);
  }

  const sections = [...sectionMap.entries()].map(([category, controlIds]) => ({
    category,
    controlIds
  }));

  return {
    controls,
    sections,
    warnings
  };
}
