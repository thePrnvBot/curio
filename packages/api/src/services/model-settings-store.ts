import type { Effect } from "effect";
import { Context } from "effect";

import type { ModelOperationFailed } from "../domain/model-settings";

export type UserModelProvider = "openai" | "openai-compatible";

export interface UserModelSettingsRecord {
  readonly provider: UserModelProvider;
  readonly model: string;
  readonly baseUrl: string | null;
  readonly apiKey: string | null;
}

export interface UserModelSettingsInput {
  readonly userId: string;
  readonly provider: UserModelProvider;
  readonly model: string;
  readonly baseUrl: string | null;
  readonly apiKey: string | null;
}

export interface ModelSettingsStoreContract {
  /** Null when the user has not overridden the server default. */
  readonly getUserModelSettings: (
    userId: string
  ) => Effect.Effect<UserModelSettingsRecord | null, ModelOperationFailed>;
  readonly setUserModelSettings: (
    settingsInput: UserModelSettingsInput
  ) => Effect.Effect<UserModelSettingsRecord, ModelOperationFailed>;
  /** Restores the server default provider. */
  readonly clearUserModelSettings: (
    userId: string
  ) => Effect.Effect<void, ModelOperationFailed>;
}

export class ModelSettingsStore extends Context.Service<
  ModelSettingsStore,
  ModelSettingsStoreContract
>()("curio/ModelSettingsStore") {}
