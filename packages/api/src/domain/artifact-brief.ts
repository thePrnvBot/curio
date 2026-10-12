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
