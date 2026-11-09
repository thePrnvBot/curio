import { Data } from "effect";

import { describeCause } from "./cause-description";

/** Bounded so one settings save cannot bloat every chat request. */
export const MAX_CUSTOM_INSTRUCTIONS_LENGTH = 4000;

export class LearningPreferencesOperationFailed extends Data.TaggedError(
  "LearningPreferencesOperationFailed"
)<{
  readonly operation: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Learning preferences operation "${this.operation}" failed: ${describeCause(
      this.cause
    )}`;
  }
}
