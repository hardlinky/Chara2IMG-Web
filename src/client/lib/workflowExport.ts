function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function shouldClearImageString(key: string, value: string): boolean {
  const normalizedKey = key.toLowerCase();
  const normalizedValue = value.trim().toLowerCase();

  if (!normalizedValue) {
    return false;
  }

  if (normalizedValue.startsWith("data:image/")) {
    return true;
  }

  if (normalizedKey === "base64_data") {
    return true;
  }

  return false;
}

export function sanitizeWorkflowForExport(workflow: Record<string, unknown>): Record<string, unknown> {
  const cloned = structuredClone(workflow) as Record<string, unknown>;

  for (const node of Object.values(cloned)) {
    if (!isRecord(node)) {
      continue;
    }

    const inputs = node.inputs;
    if (!isRecord(inputs)) {
      continue;
    }

    for (const [key, value] of Object.entries(inputs)) {
      if (typeof value !== "string") {
        continue;
      }

      if (shouldClearImageString(key, value)) {
        inputs[key] = "";
      }
    }
  }

  return cloned;
}
