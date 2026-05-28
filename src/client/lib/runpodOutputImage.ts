export type RunpodOutputImage = {
  dataUrl: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  sourcePath: string;
};

export type RunpodImagePreview = RunpodOutputImage;

function inferMimeTypeFromUrl(value: string): RunpodOutputImage["mimeType"] {
  const sanitized = value.split("?")[0]?.toLowerCase() ?? "";
  if (sanitized.endsWith(".jpg") || sanitized.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (sanitized.endsWith(".webp")) {
    return "image/webp";
  }

  if (sanitized.endsWith(".gif")) {
    return "image/gif";
  }

  return "image/png";
}

function fromPinnedImageUrl(value: string, sourcePath: string): RunpodOutputImage | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const isPinnedPath = normalized.startsWith("/api/pinned-images/") || /\/api\/pinned-images\//.test(normalized);
  if (!isPinnedPath) {
    return null;
  }

  return {
    dataUrl: normalized,
    mimeType: inferMimeTypeFromUrl(normalized),
    sourcePath
  };
}

function decodeBase64(input: string): Uint8Array | null {
  try {
    if (typeof atob === "function") {
      const decoded = atob(input);
      const bytes = new Uint8Array(decoded.length);
      for (let index = 0; index < decoded.length; index += 1) {
        bytes[index] = decoded.charCodeAt(index);
      }
      return bytes;
    }

    if (typeof Buffer !== "undefined") {
      return Uint8Array.from(Buffer.from(input, "base64"));
    }

    return null;
  } catch {
    return null;
  }
}

function detectMimeType(bytes: Uint8Array): RunpodOutputImage["mimeType"] | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return "image/gif";
  }

  return null;
}

function fromDataUrl(value: string, sourcePath: string): RunpodOutputImage | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const [, mimeType, payload] = match;
  const bytes = decodeBase64(payload);
  if (!bytes) {
    return null;
  }

  const detected = detectMimeType(bytes);
  if (!detected || detected !== mimeType) {
    return null;
  }

  return {
    dataUrl: value,
    mimeType: detected,
    sourcePath
  };
}

function fromBase64(value: string, sourcePath: string): RunpodOutputImage | null {
  const normalized = value.trim();
  if (normalized.length < 80) {
    return null;
  }

  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(normalized)) {
    return null;
  }

  const compact = normalized.replace(/[\r\n]/g, "");
  const bytes = decodeBase64(compact);
  if (!bytes) {
    return null;
  }

  const mimeType = detectMimeType(bytes);
  if (!mimeType) {
    return null;
  }

  return {
    dataUrl: `data:${mimeType};base64,${compact}`,
    mimeType,
    sourcePath
  };
}

function inspectAllImages(value: unknown, path: string, depth: number, results: RunpodOutputImage[]): void {
  if (depth > 7) {
    return;
  }

  if (typeof value === "string") {
    const image = fromDataUrl(value, path) ?? fromBase64(value, path) ?? fromPinnedImageUrl(value, path);
    if (image) {
      results.push(image);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      inspectAllImages(value[index], `${path}[${index}]`, depth + 1, results);
    }
    return;
  }

  for (const [key, nextValue] of Object.entries(value)) {
    inspectAllImages(nextValue, `${path}.${key}`, depth + 1, results);
  }
}

export function extractRunpodOutputImages(response: unknown): RunpodOutputImage[] {
  const results: RunpodOutputImage[] = [];
  inspectAllImages(response, "$", 0, results);
  return results;
}

export function extractRunpodImagePreview(response: unknown): RunpodImagePreview | null {
  return extractRunpodOutputImages(response)[0] ?? null;
}
