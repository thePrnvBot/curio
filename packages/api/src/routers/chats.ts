import { Effect } from "effect";
import { z } from "zod";

import type { CurioRuntime } from "../composition/runtime";
import { ChatStore } from "../services/chat-store";
import {
  protectedProcedure,
  respondInternalError,
  respondNotFound,
  router,
} from "./trpc";

const chatIdInputSchema = z.object({
  chatId: z.string().min(1).max(64),
});

const renameChatInputSchema = z.object({
  chatId: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
});

const createChatInputSchema = z.object({
  chatId: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
});

/** The chats store fails with exactly these two domain errors. */
const chatsErrorMapping = Effect.catchTags({
  ChatNotFound: respondNotFound,
  ChatOperationFailed: respondInternalError,
});

export function createChatsRouter(runtime: CurioRuntime) {
  return router({
    create: protectedProcedure
      .input(createChatInputSchema)
      .mutation(({ ctx, input }) =>
        runtime.runPromise(
          Effect.gen(function* create() {
            const chatStore = yield* ChatStore;
            return yield* chatStore.createChat(
              input.chatId,
              ctx.session.user.id,
              input.title
            );
          }).pipe(chatsErrorMapping)
        )
      ),

    get: protectedProcedure.input(chatIdInputSchema).query(({ ctx, input }) =>
      runtime.runPromise(
        Effect.gen(function* get() {
          const chatStore = yield* ChatStore;
          const detail = yield* chatStore.getChat(
            input.chatId,
            ctx.session.user.id
          );
          return {
            messages: [...detail.messages],
            summary: detail.summary,
          };
        }).pipe(chatsErrorMapping)
      )
    ),

    list: protectedProcedure.query(({ ctx }) =>
      runtime.runPromise(
        Effect.gen(function* list() {
          const chatStore = yield* ChatStore;
          const chats = yield* chatStore.listChats(ctx.session.user.id);
          return [...chats];
        }).pipe(chatsErrorMapping)
      )
    ),

    remove: protectedProcedure
      .input(chatIdInputSchema)
      .mutation(({ ctx, input }) =>
        runtime.runPromise(
          Effect.gen(function* remove() {
            const chatStore = yield* ChatStore;
            return yield* chatStore.deleteChat(
              input.chatId,
              ctx.session.user.id
            );
          }).pipe(chatsErrorMapping)
        )
      ),

    rename: protectedProcedure
      .input(renameChatInputSchema)
      .mutation(({ ctx, input }) =>
        runtime.runPromise(
          Effect.gen(function* rename() {
            const chatStore = yield* ChatStore;
            return yield* chatStore.renameChat(
              input.chatId,
              ctx.session.user.id,
              input.title
            );
          }).pipe(chatsErrorMapping)
        )
      ),
  });
}
