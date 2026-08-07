import type {
  DynamicInputControl,
  DynamicInputControlKind,
  DynamicInputDerivationResult,
  DynamicInputWarning
} from "../contracts/inputs";

type WorkflowNode = {
  class_type: string;
  inputs?: Record<string, unknown>;
  _meta?: {
    title?: string;
  };
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

const TITLE_PREFIX = /^\[Input(\d*)\]\s*/;
const ALLOWED_TITLE = /^[\p{L}\p{N}\s._\-()?!]+$/u;

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
    inputs: (node.inputs as Record<string, unknown> | undefined) ?? undefined,
    _meta:
      node._meta && typeof node._meta === "object" && !Array.isArray(node._meta)
        ? (node._meta as { title?: string })
        : undefined
  };
}

function inferMetadata(classType: string, inputs: Record<string, unknown>): InputMetadata | null {
  // --- Primitive node value-based detection (PrimitiveString, PrimitiveInt, etc.) ---
  if (typeof inputs.value === "number") {
    return { kind: "number", field: "value" };
  }

  if (typeof inputs.value === "boolean") {
    return { kind: "boolean", field: "value" };
  }

  if (typeof inputs.value === "string") {
    if (classType === "PrimitiveStringMultiline") return { kind: "multiline", field: "value" };
    if (classType === "PrimitiveBoolean") return { kind: "boolean", field: "value" };
    // PrimitiveString, PrimitiveInt, PrimitiveFloat all fall through to text
    return { kind: "text", field: "value" };
  }

  // Checkpoint files — detect by field name since class_type varies across loaders
  if (typeof inputs.ckpt_name === "string") return { kind: "checkpoint", field: "ckpt_name" };

  // --- Class-type explicit mappings ---
  switch (classType) {
    case "CheckpointLoaderSimple":
      if (typeof inputs.ckpt_name === "string") return { kind: "checkpoint", field: "ckpt_name" };
      break;

    case "VAELoader":
      if (typeof inputs.vae_name === "string") return { kind: "text", field: "vae_name" };
      break;

    case "KSampler":
    case "KSamplerAdvanced":
      if (typeof inputs.steps === "number") return { kind: "number", field: "steps" };
      if (typeof inputs.cfg === "number") return { kind: "number", field: "cfg" };
      if (typeof inputs.sampler_name === "string") return { kind: "text", field: "sampler_name" };
      if (typeof inputs.scheduler === "string") return { kind: "text", field: "scheduler" };
      if (typeof inputs.denoise === "number") return { kind: "number", field: "denoise" };
      if (typeof inputs.seed === "number") return { kind: "number", field: "seed" };
      break;

    case "EmptyLatentImage":
      if (typeof inputs.batch_size === "number") return { kind: "number", field: "batch_size" };
      break;

    case "mxSlider2D":
      if (typeof inputs.Xi === "number" && typeof inputs.Yi === "number") {
        return { kind: "dimension", widthField: "Xi", heightField: "Yi" };
      }
      break;

    case "CR Integer Multiple":
      if (typeof inputs.int === "number") return { kind: "number", field: "int" };
      break;

    case "CR Float":
      if (typeof inputs.float === "number") return { kind: "number", field: "float" };
      break;

    case "CR Text":
    case "StringFunction|pysssss":
    case "Text Multiline":
      if (typeof inputs.text === "string") return { kind: "multiline", field: "text" };
      break;

    case "easy loadImageBase64":
      if (typeof inputs.base64_data === "string") return { kind: "image", field: "base64_data" };
      break;
  }

  // --- Generic dimension detection (EmptyLatentImage width/height, etc.) ---
  if (typeof inputs.width === "number" && typeof inputs.height === "number") {
    return { kind: "dimension", widthField: "width", heightField: "height" };
  }

  // --- Generic fallback: use first scalar property (matches WPF default behaviour) ---
  for (const [key, val] of Object.entries(inputs)) {
    if (typeof val === "string") return { kind: "text", field: key };
    if (typeof val === "number") return { kind: "number", field: key };
    if (typeof val === "boolean") return { kind: "boolean", field: key };
  }

  return null;
}

function toKind(rawKind: string | undefined): DynamicInputControlKind | null {
  switch (rawKind) {
    case "text":
    case "multiline":
    case "number":
    case "boolean":
    case "dimension":
    case "image":
    case "lora-row":
    case "lora-list":
    case "checkpoint":
      return rawKind;
    default:
      return null;
  }
}

function toNumberOrDefault(value: unknown, fallback: number): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function createLoraListControl(args: {
  nodeId: string;
  title: string;
  titlePath: string;
  parsedTitle: { inputIndex: number; body: string };
  inputs: Record<string, unknown>;
}): DynamicInputControl | null {
  const categoryAndName = parseCategoryAndName(args.parsedTitle.body);
  const rowKeys = Object.keys(args.inputs)
    .filter((key) => /^lora_\d+$/.test(key))
    .sort((left, right) => Number(left.slice(5)) - Number(right.slice(5)));

  if (rowKeys.length === 0) return null;

  // Default value: only slots with on:true from the template
  const defaultLoras = rowKeys
    .map((key) => args.inputs[key])
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row))
    .filter((row) => Boolean(row.on))
    .map((row) => ({
      loraName: typeof row.lora === "string" && row.lora.trim() ? row.lora.trim() : "",
      strength: typeof row.strength === "number" ? row.strength : 1,
    }))
    .filter((item) => item.loraName.length > 0);

  return {
    id: `${args.nodeId}:lora-list`,
    kind: "lora-list",
    inputIndex: args.parsedTitle.inputIndex,
    fullTitle: args.title,
    category: categoryAndName.category,
    name: categoryAndName.name || "Loras",
    source: {
      nodeId: args.nodeId,
      titlePath: args.titlePath,
      valuePath: rowKeys,
    },
    constraints: { min: 0, max: 2, precision: 2 },
    defaultValue: { loras: defaultLoras },
    orderKey: `${args.parsedTitle.inputIndex.toString().padStart(6, "0")}:${args.title}`,
  };
}

function parseTitle(title: string): { inputIndex: number; body: string } | null {
  const match = TITLE_PREFIX.exec(title);
  if (!match) {
    return null;
  }

  return {
    inputIndex: match[1] ? Number(match[1]) : Number.MAX_SAFE_INTEGER,
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
  titlePath: string,
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
        titlePath,
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
      titlePath,
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

    const titleFromInputs = node.inputs.title;
    const titleFromMeta = node._meta?.title;
    // Default to Comfy node _meta.title labels and use inputs.title when _meta title is unavailable.
    const title = typeof titleFromMeta === "string" ? titleFromMeta : titleFromInputs;
    const titlePath = typeof titleFromMeta === "string" ? `${nodeId}._meta.title` : `${nodeId}.inputs.title`;
    const metadataFromInputs = node.inputs.__input as InputMetadata | undefined;
    const inferredMetadata = inferMetadata(node.class_type, node.inputs);
    const metadata =
      metadataFromInputs && typeof metadataFromInputs === "object"
        ? metadataFromInputs
        : inferredMetadata;

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

    const loraControl = createLoraListControl({
      nodeId,
      title,
      titlePath,
      parsedTitle,
      inputs: node.inputs
    });
    if (loraControl) {
      controls.push(loraControl);
      continue;
    }

    if (!metadata || typeof metadata !== "object") {
      warnings.push({
        code: "unsupported-kind",
        nodeId,
        title,
        message: `Input '${title}' does not map to a supported editable control and was skipped.`
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

    const control = createControl(nodeId, title, titlePath, parsedTitle, metadata, node.inputs);
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
