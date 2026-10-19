import { Data } from "effect";

import { describeCause } from "./cause-description";

export class ModelOperationFailed extends Data.TaggedError(
  "ModelOperationFailed"
)<{
  readonly operation: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Model settings operation "${this.operation}" failed: ${describeCause(
      this.cause
    )}`;
  }
}
