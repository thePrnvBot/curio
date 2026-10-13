import { initTRPC, TRPCError } from "@trpc/server";

import type { CurioRuntime } from "../composition/runtime";
import type { Context } from "../context";
import { createChatsRouter } from "./chats";
import { createCoursesRouter } from "./courses";
import { createModelSettingsRouter } from "./model-settings";

export const t = initTRPC.context<Context>().create();

export const { router } = t;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
      cause: "No session",
    });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});

export function createAppRouter(runtime: CurioRuntime) {
  return router({
    chats: createChatsRouter(runtime),
    courses: createCoursesRouter(runtime),
    healthCheck: publicProcedure.query(() => "OK"),
    modelSettings: createModelSettingsRouter(runtime),
    privateData: protectedProcedure.query(({ ctx }) => ({
      message: "This is private",
      user: ctx.session.user,
    })),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
