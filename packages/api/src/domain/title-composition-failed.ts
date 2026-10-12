import { Data } from "effect";

import { describeCause } from "./structured-generation-data";

export class TitleCompositionFailed extends Data.TaggedError(
  "TitleCompositionFailed"
)<{
  readonly chatId: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Failed to compose chat title — ${describeCause(this.cause)}`;
  }
}
