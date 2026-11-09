import { ModelCredentialRequired } from "../domain/model-settings";
import type {
  UserModelProvider,
  UserModelSettingsRecord,
} from "../services/model-settings-store";

export interface ProviderCredentialInput {
  /** undefined = keep the saved key; null = clear it; string = replace it. */
  readonly apiKey: string | null | undefined;
  readonly baseUrl: string | null;
  readonly existingSettings: Pick<
    UserModelSettingsRecord,
    "apiKey" | "provider"
  > | null;
  readonly provider: UserModelProvider;
}

export type ProviderCredentialResolution =
  | { readonly ok: true }
  | { readonly error: ModelCredentialRequired; readonly ok: false };

/**
 * Credential rule for saving model settings: a user-chosen base URL may only
 * be used with a user-supplied key. The deployment key is never a fallback for
 * `openai-compatible`, which is why a custom endpoint without a usable key
 * fails before anything is written.
 */
export function resolveProviderCredential({
  apiKey,
  baseUrl,
  existingSettings,
  provider,
}: ProviderCredentialInput): ProviderCredentialResolution {
  if (provider === "openai") {
    // The fixed OpenAI host may legitimately use the server key.
    return { ok: true };
  }

  if (typeof apiKey === "string" && apiKey.trim() !== "") {
    return { ok: true };
  }

  if (apiKey === undefined) {
    const savedKeyIsUsable =
      existingSettings !== null &&
      existingSettings.provider === "openai-compatible" &&
      typeof existingSettings.apiKey === "string" &&
      existingSettings.apiKey.trim() !== "";
    if (savedKeyIsUsable) {
      return { ok: true };
    }
  }

  // `null` is an explicit clear, and a string with only whitespace is not a
  // credential. Neither may leave a custom endpoint pointing at the server key.
  return {
    error: new ModelCredentialRequired({
      baseUrl: baseUrl ?? "",
      provider,
    }),
    ok: false,
  };
}
