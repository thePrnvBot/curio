import { Effect } from "effect";
import { z } from "zod";

import type { CurioRuntime } from "../composition/runtime";
import { ModelSettingsStore } from "../services/model-settings-store";
import { protectedProcedure, respondInternalError, router } from "./trpc";

const providerInputSchema = z.object({
  apiKey: z.string().min(20).max(300).optional().nullable(),
  baseUrl: z.string().url().max(2000).optional().nullable(),
  model: z.string().min(1).max(200),
  provider: z.enum(["openai", "openai-compatible"]),
});

const providerInputWithValidation = providerInputSchema.superRefine(
  (input, refineContext) => {
    if (input.provider === "openai-compatible" && !input.baseUrl) {
      refineContext.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "A base URL is required for the OpenAI-compatible provider (e.g. https://api.example.com/v1)",
        path: ["baseUrl"],
      });
    }
  }
);

/** The model-settings store fails with exactly this domain error. */
const modelSettingsErrorMapping = Effect.catchTags({
  ModelOperationFailed: respondInternalError,
});

export function createModelSettingsRouter(runtime: CurioRuntime) {
  return router({
    get: protectedProcedure.query(({ ctx }) =>
      runtime.runPromise(
        Effect.gen(function* getModelSettings() {
          const modelSettingsStore = yield* ModelSettingsStore;
          return yield* modelSettingsStore.getUserModelSettings(
            ctx.session.user.id
          );
        }).pipe(modelSettingsErrorMapping)
      )
    ),

    set: protectedProcedure
      .input(providerInputWithValidation)
      .mutation(({ ctx, input }) =>
        runtime.runPromise(
          Effect.gen(function* setModelSettings() {
            const modelSettingsStore = yield* ModelSettingsStore;
            return yield* modelSettingsStore.setUserModelSettings({
              apiKey: input.apiKey ?? null,
              baseUrl:
                input.provider === "openai-compatible"
                  ? (input.baseUrl ?? null)
                  : null,
              model: input.model,
              provider: input.provider,
              userId: ctx.session.user.id,
            });
          }).pipe(modelSettingsErrorMapping)
        )
      ),

    clear: protectedProcedure.mutation(({ ctx }) =>
      runtime.runPromise(
        Effect.gen(function* clearModelSettings() {
          const modelSettingsStore = yield* ModelSettingsStore;
          yield* modelSettingsStore.clearUserModelSettings(ctx.session.user.id);
          return { restoredDefault: true };
        }).pipe(modelSettingsErrorMapping)
      )
    ),
  });
}
