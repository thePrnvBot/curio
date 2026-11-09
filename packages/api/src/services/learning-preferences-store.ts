import type { Effect } from "effect";
import { Context } from "effect";

import type { LearningPreferencesOperationFailed } from "../domain/learning-preferences";

export interface LearningPreferencesRecord {
  readonly customInstructions: string;
}

export interface LearningPreferencesInput {
  readonly userId: string;
  readonly customInstructions: string;
}

export interface LearningPreferencesStoreContract {
  /** Null when the user has not saved any custom instructions. */
  readonly get: (
    userId: string
  ) => Effect.Effect<
    LearningPreferencesRecord | null,
    LearningPreferencesOperationFailed
  >;
  readonly set: (
    input: LearningPreferencesInput
  ) => Effect.Effect<
    LearningPreferencesRecord,
    LearningPreferencesOperationFailed
  >;
}

export class LearningPreferencesStore extends Context.Service<
  LearningPreferencesStore,
  LearningPreferencesStoreContract
>()("curio/LearningPreferencesStore") {}
