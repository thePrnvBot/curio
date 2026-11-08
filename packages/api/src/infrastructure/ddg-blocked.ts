import { Data } from "effect";

export class DdgBlocked extends Data.TaggedError("DdgBlocked")<{
  readonly query: string;
}> {
  override get message(): string {
    return `DuckDuckGo served an anti-bot page for "${this.query}"`;
  }
}
