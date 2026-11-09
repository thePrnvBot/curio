import type { Database } from "@curio/db";
import { userLearningPreferences } from "@curio/db/schema/learning-preferences";
import { eq } from "drizzle-orm";
import { Effect, Option } from "effect";

import { LearningPreferencesOperationFailed } from "../domain/learning-preferences";
import type {
  LearningPreferencesStoreContract,
  LearningPreferencesRecord,
} from "../services/learning-preferences-store";

function withLearningError(operation: string) {
  return <Success>(
    effect: Effect.Effect<Success, unknown, never>
  ): Effect.Effect<Success, LearningPreferencesOperationFailed, never> =>
    Effect.mapError(
      effect,
      (cause: unknown) =>
        new LearningPreferencesOperationFailed({ cause, operation })
    );
}

const preferencesSelection = {
  customInstructions: userLearningPreferences.customInstructions,
} as const;

export function createDrizzleLearningPreferencesStore(
  database: Database
): LearningPreferencesStoreContract {
  return {
    get: (userId) =>
      withLearningError("getLearningPreferences")(
        Effect.tryPromise(() =>
          database
            .select(preferencesSelection)
            .from(userLearningPreferences)
            .where(eq(userLearningPreferences.userId, userId))
            .limit(1)
        )
      ).pipe(
        Effect.map((rows) =>
          Option.getOrNull(Option.fromNullishOr(rows.at(0)))
        ),
        Effect.map((row) =>
          row === null
            ? null
            : ({
                customInstructions: row.customInstructions,
              } satisfies LearningPreferencesRecord)
        )
      ),

    set: ({ customInstructions, userId }) =>
      withLearningError("setLearningPreferences")(
        Effect.tryPromise(async () => {
          const insertedRows = await database
            .insert(userLearningPreferences)
            .values({ customInstructions, userId })
            .onConflictDoUpdate({
              set: { customInstructions },
              target: userLearningPreferences.userId,
            })
            .returning(preferencesSelection);
          const insertedRow = insertedRows.at(0);
          if (insertedRow === undefined) {
            throw new Error("Learning preferences upsert returned no rows");
          }
          return {
            customInstructions: insertedRow.customInstructions,
          } satisfies LearningPreferencesRecord;
        })
      ),
  };
}
