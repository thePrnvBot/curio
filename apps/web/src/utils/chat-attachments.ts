/** Attachment policy shared by the prompt input and the chat route. */

/** Keep request bodies, data URLs and provider payloads bounded. */
export const MAX_CHAT_ATTACHMENT_BYTES = 8 * 1024 * 1024;

/** Types the Director can actually reason about (vision + text documents). */
export const CHAT_ATTACHMENT_ACCEPT =
  "image/*,application/pdf,text/plain,text/markdown,text/csv,application/json";

const SUPPORTED_EXACT_MEDIA_TYPES = new Set([
  "application/json",
  "application/pdf",
  "text/csv",
  "text/markdown",
  "text/plain",
]);

/** Images are multimodal input; videos/audio are not supported by the model. */
export function isSupportedChatAttachment(mediaType: string): boolean {
  const normalized = mediaType.trim().toLowerCase();
  if (normalized === "") {
    return false;
  }
  return (
    normalized.startsWith("image/") ||
    SUPPORTED_EXACT_MEDIA_TYPES.has(normalized)
  );
}

/** User-facing explanation for a rejected attachment. */
export function describeUnsupportedAttachment(file: {
  readonly filename?: string;
  readonly mediaType?: string;
}): string {
  const label =
    file.filename === undefined || file.filename === ""
      ? "That file"
      : `"${file.filename}"`;
  const mediaType = file.mediaType?.toLowerCase() ?? "";
  if (mediaType.startsWith("video/")) {
    return `${label} is a video. Curio can read images and documents, not videos yet.`;
  }
  if (mediaType.startsWith("audio/")) {
    return `${label} is audio. Curio can read images and documents, not audio yet.`;
  }
  return `${label} isn't a supported attachment. Add an image, PDF, or text file instead.`;
}
