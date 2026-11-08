import { Data } from "effect";

import { describeCause } from "./cause-description";

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
