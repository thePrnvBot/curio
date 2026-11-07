import type { CurioRuntime } from "../composition/runtime";
import { createChatsRouter } from "./chats";
import { createCoursesRouter } from "./courses";
import { createModelSettingsRouter } from "./model-settings";
import { publicProcedure, router } from "./trpc";

export function createAppRouter(runtime: CurioRuntime) {
  return router({
    chats: createChatsRouter(runtime),
    courses: createCoursesRouter(runtime),
    healthCheck: publicProcedure.query(() => "OK"),
    modelSettings: createModelSettingsRouter(runtime),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
