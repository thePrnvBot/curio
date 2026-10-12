export interface GeneratedArtifactBrief {
  /** Human-facing artifact title. */
  readonly title: string;
  /** Entry filename including extension, e.g. "index.html". */
  readonly filename: string;
  /** IANA media type resolved from the requested format. */
  readonly mediaType: string;
  /** Full text content of the artifact file. */
  readonly content: string;
  /** One-or-two sentence plain-language summary for the chat reply. */
  readonly summary: string;
}

export interface ChatTitleCompositionRequest {
  /** Chat id — some gateways route model requests per conversation. */
  readonly chatId: string;
  /** The first user message text, capped by the caller. */
  readonly userText: string;
  /** The first assistant reply text, capped by the caller. */
  readonly assistantText: string;
}

export interface ChatTitleCompositionResult {
  readonly title: string;
}

export function describeCause(cause: unknown): string {
  if (typeof cause === "string") {
    return cause;
  }
  if (cause instanceof Error) {
    const parentDescription = `${cause.name}: ${cause.message}`;
    const hasNestedCause =
      "cause" in cause && cause.cause !== undefined && cause.cause !== null;
    if (hasNestedCause) {
      return `${parentDescription} (${describeCause(cause.cause)})`;
    }
    return parentDescription;
  }
  if (cause !== null && typeof cause === "object") {
    return JSON.stringify(cause);
  }
  return "unknown cause";
}
