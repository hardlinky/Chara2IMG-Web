const DATA_URL_PATTERN = /data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]*/gi;
// Long unbroken base64 runs only occur in embedded media, never in prose or ids.
const LONG_BASE64_PATTERN = /[A-Za-z0-9+/]{256,}={0,2}/g;

export const OMITTED_IMAGE_PLACEHOLDER = "[image data omitted]";

/** Replace embedded image payloads so they never reach a toast, log, or report. */
export function stripEmbeddedImageData(value: string): string {
  return value
    .replace(DATA_URL_PATTERN, OMITTED_IMAGE_PLACEHOLDER)
    .replace(LONG_BASE64_PATTERN, OMITTED_IMAGE_PLACEHOLDER);
}
