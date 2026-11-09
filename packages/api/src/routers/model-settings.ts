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

/**
 * The stored API key is a bearer credential: it is only ever needed on the
 * server to build the model. Never send it back over the wire, even to the
 * user who owns it - a stolen session (or any XSS) must not reveal it.
 */
function withoutApiKey<T extends { readonly apiKey: string | null }>(
  settings: T
): Omit<T, "apiKey"> & { readonly hasApiKey: boolean } {
  const { apiKey, ...publicSettings } = settings;
  return { ...publicSettings, hasApiKey: apiKey !== null && apiKey !== "" };
}

export function createModelSettingsRouter(runtime: CurioRuntime) {
  return router({
    get: protectedProcedure.query(({ ctx }) =>
      runtime.runPromise(
        Effect.gen(function* getModelSettings() {
          const modelSettingsStore = yield* ModelSettingsStore;
          const settings = yield* modelSettingsStore.getUserModelSettings(
            ctx.session.user.id
          );
          return settings === null ? null : withoutApiKey(settings);
        }).pipe(modelSettingsErrorMapping)
      )
    ),

    set: protectedProcedure
      .input(providerInputWithValidation)
      .mutation(({ ctx, input }) =>
        runtime.runPromise(
          Effect.gen(function* setModelSettings() {
            const modelSettingsStore = yield* ModelSettingsStore;
            const settings = yield* modelSettingsStore.setUserModelSettings({
              // undefined preserves the saved key; null clears it. The input
              // schema rejects empty strings, so "" never silently clears.
              apiKey: input.apiKey,
              baseUrl:
                input.provider === "openai-compatible"
                  ? (input.baseUrl ?? null)
                  : null,
              model: input.model,
              provider: input.provider,
              userId: ctx.session.user.id,
            });
            return withoutApiKey(settings);
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
