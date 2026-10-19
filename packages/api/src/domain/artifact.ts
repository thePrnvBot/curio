import { Data } from "effect";

import { describeCause } from "./cause-description";

export class ArtifactGenerationFailed extends Data.TaggedError(
  "ArtifactGenerationFailed"
)<{
  readonly prompt: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Failed to generate artifact content — ${describeCause(this.cause)}`;
  }
}

export class ArtifactPublishFailed extends Data.TaggedError(
  "ArtifactPublishFailed"
)<{
  readonly title: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Failed to publish artifact "${this.title}" — ${describeCause(
      this.cause
    )}`;
  }
}

/// -------------------- generation --------------------
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

/// -------------------- publication --------------------

export interface ArtifactPublicationInput {
  /** Human-facing artifact name. */
  readonly title: string;
  /** Entry filename inside the artifact, e.g. "index.html". */
  readonly entryFilename: string;
  /** UTF-8 text content of the artifact file. */
  readonly content: string;
  /** IANA media type, e.g. "text/html". */
  readonly mediaType: string;
}

export interface ArtifactLinks {
  /** Full-screen review URL with comments — the first link to show people. */
  readonly review: string;
  /** URL that follows the artifact's current version. */
  readonly artifact: string;
  /** URL for the immutable raw content of the saved version. */
  readonly version: string;
}

export interface ArtifactPublicationResult {
  readonly artifactId: string;
  readonly versionId: string;
  readonly links: ArtifactLinks;
}
