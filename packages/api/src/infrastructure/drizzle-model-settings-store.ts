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
import type { ApiKeyCipher } from "./api-key-cipher";

interface UserModelSettingsRow {
  readonly apiKey: string | null;
  readonly baseUrl: string | null;
  readonly model: string;
  readonly provider: string;
}

function normalizeProvider(provider: string): UserModelProvider {
  return provider === "openai" ? "openai" : "openai-compatible";
}

function rowToRecord(
  row: UserModelSettingsRow,
  cipher: ApiKeyCipher
): UserModelSettingsRecord {
  return {
    apiKey:
      row.apiKey === null || row.apiKey === ""
        ? null
        : cipher.decrypt(row.apiKey),
    baseUrl: row.baseUrl,
    model: row.model,
    provider: normalizeProvider(row.provider),
  };
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
  database: Database,
  cipher: ApiKeyCipher
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
        Effect.map((rows) =>
          Option.getOrNull(Option.fromNullishOr(rows.at(0)))
        ),
        Effect.map((row) => (row === null ? null : rowToRecord(row, cipher)))
      ),

    setUserModelSettings: ({ apiKey, baseUrl, model, provider, userId }) =>
      withModelError("setUserModelSettings")(
        Effect.tryPromise(async () => {
          const storedApiKey =
            apiKey === null || apiKey === "" ? null : cipher.encrypt(apiKey);
          const insertedRows = await database
            .insert(userModelSettings)
            .values({ apiKey: storedApiKey, baseUrl, model, provider, userId })
            .onConflictDoUpdate({
              set: { apiKey: storedApiKey, baseUrl, model, provider },
              target: userModelSettings.userId,
            })
            .returning(settingsSelection);
          const insertedRow = insertedRows.at(0);
          if (insertedRow === undefined) {
            throw new Error("Model settings upsert returned no rows");
          }
          return rowToRecord(insertedRow, cipher);
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
