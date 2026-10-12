import { Data } from "effect";

export class ChatOperationFailed extends Data.TaggedError(
  "ChatOperationFailed"
)<{
  readonly operation: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Chat operation "${this.operation}" failed`;
  }
}
