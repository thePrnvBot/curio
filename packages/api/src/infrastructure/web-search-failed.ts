import { Data } from "effect";

import { describeCause } from "../domain/cause-description";

export class WebSearchFailed extends Data.TaggedError("WebSearchFailed")<{
  readonly operation: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Web search failed while ${this.operation}: ${describeCause(this.cause)}`;
  }
}
