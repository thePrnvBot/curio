import { Data } from "effect";

export class WebReadFailed extends Data.TaggedError("WebReadFailed")<{
  readonly readFailureMessage: string;
}> {
  override get message(): string {
    return this.readFailureMessage;
  }
}
