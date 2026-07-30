// Derived/raw base64 image values often lack the `data:` prefix; sniff the
// signature so the browser can render them.
export function toImageDataUrl(raw: string): string {
  if (!raw) {
    return "";
  }
  if (raw.startsWith("data:")) {
    return raw;
  }

  let mimeType = "image/png";
  if (raw.startsWith("/9j/")) {
    mimeType = "image/jpeg";
  } else if (raw.startsWith("R0lGOD")) {
    mimeType = "image/gif";
  } else if (raw.startsWith("UklGR")) {
    mimeType = "image/webp";
  }

  return `data:${mimeType};base64,${raw}`;
}

const MODEL_EXTENSION = /\.(safetensors|ckpt|pt|pth|bin|vae)$/i;

export function stripModelExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base.replace(MODEL_EXTENSION, "");
}

export function looksLikeModelFile(value: string): boolean {
  return /^\S+\.(safetensors|ckpt|pt|pth|bin|vae)$/i.test(value);
}
