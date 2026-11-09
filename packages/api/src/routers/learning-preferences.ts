import { Effect } from "effect";
import { z } from "zod";

import type { CurioRuntime } from "../composition/runtime";
import { MAX_CUSTOM_INSTRUCTIONS_LENGTH } from "../domain/learning-preferences";
import { LearningPreferencesStore } from "../services/learning-preferences-store";
import { protectedProcedure, respondInternalError, router } from "./trpc";

const customInstructionsInputSchema = z.object({
  customInstructions: z
    .string()
    .max(MAX_CUSTOM_INSTRUCTIONS_LENGTH)
    .describe(
      "How the Director should adapt its teaching: pace, depth, tone, examples, and study strategies"
    ),
});

const learningPreferencesErrorMapping = Effect.catchTags({
  LearningPreferencesOperationFailed: respondInternalError,
});

export function createLearningPreferencesRouter(runtime: CurioRuntime) {
  return router({
    get: protectedProcedure.query(({ ctx }) =>
      runtime.runPromise(
        Effect.gen(function* getLearningPreferences() {
          const store = yield* LearningPreferencesStore;
          return yield* store.get(ctx.session.user.id);
        }).pipe(learningPreferencesErrorMapping)
      )
    ),

    set: protectedProcedure
      .input(customInstructionsInputSchema)
      .mutation(({ ctx, input }) =>
        runtime.runPromise(
          Effect.gen(function* setLearningPreferences() {
            const store = yield* LearningPreferencesStore;
            return yield* store.set({
              customInstructions: input.customInstructions.trim(),
              userId: ctx.session.user.id,
            });
          }).pipe(learningPreferencesErrorMapping)
        )
      ),
  });
}
