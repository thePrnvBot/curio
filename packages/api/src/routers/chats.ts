import { TRPCError } from "@trpc/server";
import { Effect } from "effect";
import { z } from "zod";

import type { CurioRuntime } from "../composition/runtime";
import { ChatNotFound } from "../domain/chat-not-found";
import { ChatOperationFailed } from "../domain/chat-operation-failed";
import { protectedProcedure, router } from "../index";
import { ChatStore } from "../services/chat-store";

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

async function unwrap<T>(value: Promise<T>): Promise<T> {
  try {
    return await value;
  } catch (error) {
    if (error instanceof ChatNotFound) {
      throw new TRPCError({
        cause: error,
        code: "NOT_FOUND",
        message: error.message,
      });
    }
    if (error instanceof ChatOperationFailed) {
      throw new TRPCError({
        cause: error,
        code: "INTERNAL_SERVER_ERROR",
        message: `Chat operation "${error.operation}" failed`,
      });
    }
    throw error;
  }
}

export function createChatsRouter(runtime: CurioRuntime) {
  return router({
    create: protectedProcedure
      .input(createChatInputSchema)
      .mutation(({ ctx, input }) =>
        unwrap(
          runtime.runPromise(
            Effect.gen(function* create() {
              const chatStore = yield* ChatStore;
              return yield* chatStore.createChat(
                input.chatId,
                ctx.session.user.id,
                input.title
              );
            })
          )
        )
      ),

    get: protectedProcedure.input(chatIdInputSchema).query(({ ctx, input }) =>
      unwrap(
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
          })
        )
      )
    ),

    list: protectedProcedure.query(({ ctx }) =>
      unwrap(
        runtime.runPromise(
          Effect.gen(function* list() {
            const chatStore = yield* ChatStore;
            const chats = yield* chatStore.listChats(ctx.session.user.id);
            return [...chats];
          })
        )
      )
    ),

    remove: protectedProcedure
      .input(chatIdInputSchema)
      .mutation(({ ctx, input }) =>
        unwrap(
          runtime.runPromise(
            Effect.gen(function* remove() {
              const chatStore = yield* ChatStore;
              return yield* chatStore.deleteChat(
                input.chatId,
                ctx.session.user.id
              );
            })
          )
        )
      ),

    rename: protectedProcedure
      .input(renameChatInputSchema)
      .mutation(({ ctx, input }) =>
        unwrap(
          runtime.runPromise(
            Effect.gen(function* rename() {
              const chatStore = yield* ChatStore;
              return yield* chatStore.renameChat(
                input.chatId,
                ctx.session.user.id,
                input.title
              );
            })
          )
        )
      ),
  });
}
