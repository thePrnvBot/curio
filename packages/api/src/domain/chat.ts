import type { UIMessage } from "ai";
import { Data } from "effect";

export type ChatRole = UIMessage["role"];

export interface ChatSummary {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ChatMessageRecord {
  readonly id: string;
  readonly role: ChatRole;
  readonly parts: UIMessage["parts"];
  readonly createdAt: string;
}

export interface ChatDetail {
  readonly summary: ChatSummary;
  readonly messages: readonly ChatMessageRecord[];
}

export interface StoredConversationMessages {
  readonly chatId: string;
  readonly messages: readonly Pick<UIMessage, "id" | "role" | "parts">[];
}

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

export class ChatNotFound extends Data.TaggedError("ChatNotFound")<{
  readonly chatId: string;
}> {
  override get message(): string {
    return `Chat ${this.chatId} was not found`;
  }
}

export function toUIMessage(record: ChatMessageRecord): UIMessage {
  return {
    id: record.id,
    parts: record.parts,
    role: record.role,
  };
}
