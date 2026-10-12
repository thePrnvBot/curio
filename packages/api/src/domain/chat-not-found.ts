import { Data } from "effect";

export class ChatNotFound extends Data.TaggedError("ChatNotFound")<{
  readonly chatId: string;
}> {
  override get message(): string {
    return `Chat ${this.chatId} was not found`;
  }
}
