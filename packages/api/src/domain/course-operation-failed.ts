import { Data } from "effect";

import { describeCause } from "./cause-description";

export class CourseOperationFailed extends Data.TaggedError(
  "CourseOperationFailed"
)<{
  readonly operation: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Course operation "${this.operation}" failed: ${describeCause(
      this.cause
    )}`;
  }
}
