import type { UIMessage } from "ai";

export { ChatNotFound } from "./chat-not-found";
export { ChatOperationFailed } from "./chat-operation-failed";

export type ChatRole = UIMessage["role"];

const CHAT_ROLES = [
  "system",
  "user",
  "assistant",
] as const satisfies readonly ChatRole[];

/** Rows written by older versions may not match the union; keep them
 * renderable instead of failing an entire conversation load. */
export function normalizeChatRole(role: string): ChatRole {
  return CHAT_ROLES.find((candidate) => candidate === role) ?? "assistant";
}

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

export function toUIMessage(record: ChatMessageRecord): UIMessage {
  return {
    id: record.id,
    parts: record.parts,
    role: record.role,
  };
}
