import type { Database } from "@curio/db";
import { userModelSettings } from "@curio/db/schema/model-settings";
import { eq } from "drizzle-orm";
import { Effect, Option } from "effect";

import { ModelOperationFailed } from "../domain/model-settings";
import type {
  ModelSettingsStoreContract,
  UserModelProvider,
  UserModelSettingsRecord,
} from "../services/model-settings-store";

interface UserModelSettingsRow {
  readonly apiKey: string | null;
  readonly baseUrl: string | null;
  readonly model: string;
  readonly provider: string;
}

function rowToRecord(row: UserModelSettingsRow): UserModelSettingsRecord {
  return {
    apiKey: row.apiKey,
    baseUrl: row.baseUrl,
    model: row.model,
    provider: normalizeProvider(row.provider),
  };
}

function normalizeProvider(provider: string): UserModelProvider {
  return provider === "openai" ? "openai" : "openai-compatible";
}

function withModelError(operation: string) {
  return <Success>(
    effect: Effect.Effect<Success, unknown, never>
  ): Effect.Effect<Success, ModelOperationFailed, never> =>
    Effect.mapError(
      effect,
      (cause: unknown) => new ModelOperationFailed({ cause, operation })
    );
}

const settingsSelection = {
  apiKey: userModelSettings.apiKey,
  baseUrl: userModelSettings.baseUrl,
  model: userModelSettings.model,
  provider: userModelSettings.provider,
} as const;

export function createDrizzleModelSettingsStore(
  database: Database
): ModelSettingsStoreContract {
  return {
    getUserModelSettings: (userId) =>
      withModelError("getUserModelSettings")(
        Effect.tryPromise(() =>
          database
            .select(settingsSelection)
            .from(userModelSettings)
            .where(eq(userModelSettings.userId, userId))
            .limit(1)
        )
      ).pipe(
        Effect.flatMap((rows) =>
          Option.fromNullishOr(rows.at(0)).pipe(
            Option.match({
              onNone: () => Effect.succeed(null),
              onSome: (row) => Effect.succeed(rowToRecord(row)),
            })
          )
        )
      ),

    setUserModelSettings: ({ apiKey, baseUrl, model, provider, userId }) =>
      withModelError("setUserModelSettings")(
        Effect.tryPromise(async () => {
          const insertedRows = await database
            .insert(userModelSettings)
            .values({ apiKey, baseUrl, model, provider, userId })
            .onConflictDoUpdate({
              set: { apiKey, baseUrl, model, provider },
              target: userModelSettings.userId,
            })
            .returning(settingsSelection);
          const insertedRow = insertedRows.at(0);
          if (insertedRow === undefined) {
            throw new Error("Model settings upsert returned no rows");
          }
          return rowToRecord(insertedRow);
        })
      ),

    clearUserModelSettings: (userId) =>
      withModelError("clearUserModelSettings")(
        Effect.tryPromise(() =>
          database
            .delete(userModelSettings)
            .where(eq(userModelSettings.userId, userId))
        )
      ).pipe(Effect.asVoid),
  };
}
