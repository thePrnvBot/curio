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
