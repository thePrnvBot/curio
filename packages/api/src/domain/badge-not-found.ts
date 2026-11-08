import { Data } from "effect";

export class BadgeNotFound extends Data.TaggedError("BadgeNotFound")<{
  readonly badgeId: string;
}> {
  override get message(): string {
    return `Badge ${this.badgeId} was not found`;
  }
}
