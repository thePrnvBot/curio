import type { UIMessage } from "ai";
import type { Effect } from "effect";
import { Context } from "effect";

import type {
  ChatDetail,
  ChatMessageRecord,
  ChatNotFound,
  ChatOperationFailed,
  ChatSummary,
  StoredConversationMessages,
} from "../domain/chat";

export interface ChatStoreContract {
  readonly listChats: (
    userId: string
  ) => Effect.Effect<readonly ChatSummary[], ChatOperationFailed>;
  readonly getChat: (
    chatId: string,
    userId: string
  ) => Effect.Effect<ChatDetail, ChatNotFound | ChatOperationFailed>;
  readonly createChat: (
    chatId: string,
    userId: string,
    title: string
  ) => Effect.Effect<ChatSummary, ChatOperationFailed>;
  readonly renameChat: (
    chatId: string,
    userId: string,
    title: string
  ) => Effect.Effect<ChatSummary, ChatNotFound | ChatOperationFailed>;
  readonly deleteChat: (
    chatId: string,
    userId: string
  ) => Effect.Effect<void, ChatNotFound | ChatOperationFailed>;
  readonly ensureChatForUser: (
    chatId: string,
    userId: string
  ) => Effect.Effect<void, ChatNotFound | ChatOperationFailed>;
  readonly setMessageTitle: (
    chatId: string,
    userId: string,
    title: string
  ) => Effect.Effect<void, ChatOperationFailed>;
  readonly replaceMessages: (
    messages: StoredConversationMessages,
    userId: string
  ) => Effect.Effect<void, ChatNotFound | ChatOperationFailed>;
  /** Appends one message without rewriting the transcript (artifacts). */
  readonly appendMessage: (
    chatId: string,
    userId: string,
    message: Pick<UIMessage, "id" | "role" | "parts">
  ) => Effect.Effect<void, ChatNotFound | ChatOperationFailed>;
  readonly listMessageRecords: (
    chatId: string,
    userId: string
  ) => Effect.Effect<
    readonly ChatMessageRecord[],
    ChatNotFound | ChatOperationFailed
  >;
}

export class ChatStore extends Context.Service<ChatStore, ChatStoreContract>()(
  "curio/ChatStore"
) {}
