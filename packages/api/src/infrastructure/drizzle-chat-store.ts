import type { Database } from "@curio/db";
import { chat, chatMessage } from "@curio/db/schema/chat";
import type { UIMessage } from "ai";
import { and, asc, desc, eq } from "drizzle-orm";
import { Effect, Option } from "effect";

import type {
  ChatDetail,
  ChatMessageRecord,
  ChatSummary,
  StoredConversationMessages,
} from "../domain/chat";
import {
  ChatNotFound,
  ChatOperationFailed,
  normalizeChatRole,
} from "../domain/chat";
import type { ChatStoreContract } from "../services/chat-store";

interface ChatRow {
  readonly id: string;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function rowToChatSummary(row: ChatRow): ChatSummary {
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toStoreError(operation: string) {
  return (cause: unknown): ChatOperationFailed =>
    new ChatOperationFailed({ cause, operation });
}

function withStoreError(operation: string) {
  return <Success>(
    effect: Effect.Effect<Success, unknown, never>
  ): Effect.Effect<Success, ChatOperationFailed, never> =>
    Effect.mapError(effect, toStoreError(operation));
}

export function createDrizzleChatStore(database: Database): ChatStoreContract {
  const requireChatRow = (chatId: string, userId: string) =>
    withStoreError("requireChatRow")(
      Effect.tryPromise(() =>
        database
          .select({
            id: chat.id,
            title: chat.title,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
          })
          .from(chat)
          .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
          .limit(1)
      )
    ).pipe(
      Effect.flatMap((rows) =>
        Option.fromNullishOr(rows.at(0)).pipe(
          Option.match({
            onNone: () => Effect.fail(new ChatNotFound({ chatId })),
            onSome: Effect.succeed,
          })
        )
      )
    );

  const listMessageRecordsFor = (chatId: string) =>
    withStoreError("listMessageRecords")(
      Effect.tryPromise(() =>
        database
          .select({
            id: chatMessage.id,
            role: chatMessage.role,
            parts: chatMessage.parts,
            createdAt: chatMessage.createdAt,
          })
          .from(chatMessage)
          .where(eq(chatMessage.chatId, chatId))
          .orderBy(asc(chatMessage.createdAt))
      )
    ).pipe(
      Effect.map((rows): ChatMessageRecord[] =>
        rows.map((row) => ({
          createdAt: row.createdAt.toISOString(),
          id: row.id,
          parts: row.parts,
          role: normalizeChatRole(row.role),
        }))
      )
    );

  return {
    listChats: (userId) =>
      withStoreError("listChats")(
        Effect.tryPromise(() =>
          database
            .select({
              id: chat.id,
              title: chat.title,
              createdAt: chat.createdAt,
              updatedAt: chat.updatedAt,
            })
            .from(chat)
            .where(eq(chat.userId, userId))
            .orderBy(desc(chat.updatedAt))
        )
      ).pipe(Effect.map((rows) => rows.map(rowToChatSummary))),

    getChat: (chatId, userId) =>
      requireChatRow(chatId, userId).pipe(
        Effect.flatMap((row) =>
          listMessageRecordsFor(chatId).pipe(
            Effect.map((messages): ChatDetail => ({
              messages,
              summary: rowToChatSummary(row),
            }))
          )
        )
      ),

    createChat: (chatId, userId, title) =>
      withStoreError("createChat")(
        Effect.tryPromise(async () => {
          const insertedRows = await database
            .insert(chat)
            .values({ id: chatId, title, userId })
            .onConflictDoNothing({ target: chat.id })
            .returning({
              id: chat.id,
              title: chat.title,
              createdAt: chat.createdAt,
              updatedAt: chat.updatedAt,
            });
          const insertedRow = insertedRows.at(0);
          if (insertedRow) {
            return rowToChatSummary(insertedRow);
          }
          const existingRows = await database
            .select({
              id: chat.id,
              title: chat.title,
              createdAt: chat.createdAt,
              updatedAt: chat.updatedAt,
            })
            .from(chat)
            .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
            .limit(1);
          const existingRow = existingRows.at(0);
          if (existingRow) {
            return rowToChatSummary(existingRow);
          }
          throw new ChatOperationFailed({
            cause: new Error(
              `Chat ${chatId} already exists for a different user`
            ),
            operation: "createChat",
          });
        })
      ),

    renameChat: (chatId, userId, title) =>
      withStoreError("renameChat")(
        Effect.tryPromise(() =>
          database
            .update(chat)
            .set({ title })
            .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
            .returning({
              id: chat.id,
              title: chat.title,
              createdAt: chat.createdAt,
              updatedAt: chat.updatedAt,
            })
        )
      ).pipe(
        Effect.flatMap((rows) =>
          Option.fromNullishOr(rows.at(0)).pipe(
            Option.match({
              onNone: () => Effect.fail(new ChatNotFound({ chatId })),
              onSome: (row) => Effect.succeed(rowToChatSummary(row)),
            })
          )
        )
      ),

    deleteChat: (chatId, userId) =>
      withStoreError("deleteChat")(
        Effect.tryPromise(() =>
          database
            .delete(chat)
            .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
            .returning({ id: chat.id })
        )
      ).pipe(
        Effect.flatMap((rows) =>
          rows.length === 0
            ? Effect.fail(new ChatNotFound({ chatId }))
            : Effect.void
        )
      ),

    ensureChatForUser: (chatId, userId) =>
      withStoreError("ensureChatForUser")(
        Effect.gen(function* ensureChat() {
          const insertedRows = yield* Effect.tryPromise(() =>
            database
              .insert(chat)
              .values({ id: chatId, userId })
              .onConflictDoNothing({ target: chat.id })
              .returning({ id: chat.id })
          );
          if (insertedRows.at(0) !== undefined) {
            return;
          }
          // The id already exists: it must belong to this user, otherwise a
          // guessed id would silently attach work to someone else's chat.
          const existingRows = yield* Effect.tryPromise(() =>
            database
              .select({ userId: chat.userId })
              .from(chat)
              .where(eq(chat.id, chatId))
              .limit(1)
          );
          const existingRow = existingRows.at(0);
          if (existingRow === undefined || existingRow.userId !== userId) {
            return yield* Effect.fail(new ChatNotFound({ chatId }));
          }
        })
      ),

    setMessageTitle: (chatId, userId, title) =>
      withStoreError("setMessageTitle")(
        Effect.tryPromise(() =>
          database
            .update(chat)
            .set({ title })
            .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
        )
      ).pipe(Effect.asVoid),

    replaceMessages: (
      { chatId, messages }: StoredConversationMessages,
      userId
    ) =>
      requireChatRow(chatId, userId).pipe(
        Effect.flatMap(() =>
          withStoreError("replaceMessages")(
            Effect.tryPromise(() =>
              database.transaction(async (transactionDatabase) => {
                await transactionDatabase
                  .delete(chatMessage)
                  .where(eq(chatMessage.chatId, chatId));
                if (messages.length === 0) {
                  return;
                }
                await transactionDatabase.insert(chatMessage).values(
                  messages.map(
                    (message: Pick<UIMessage, "id" | "role" | "parts">) => ({
                      chatId,
                      id: message.id,
                      parts: message.parts,
                      role: message.role,
                    })
                  )
                );
              })
            )
          )
        ),
        Effect.asVoid
      ),

    listMessageRecords: (chatId, userId) =>
      requireChatRow(chatId, userId).pipe(
        Effect.flatMap(() => listMessageRecordsFor(chatId))
      ),
  };
}
