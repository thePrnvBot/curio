import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

import type { UserModelProvider } from "../services/model-settings-store";

export interface UserChatModelConfig {
  readonly model: string;
  readonly provider: UserModelProvider;
  /** Required for openai-compatible; ignored for openai. */
  readonly baseUrl: string | null;
  /** Personal key; when null the caller supplies the server environment key. */
  readonly apiKey: string | null;
}

export interface UserChatModelFactoryInput {
  readonly settings: UserChatModelConfig;
  /** Conversation id forwarded as the `x-opencode-session` header for
   * openai-compatible providers, so gateways that route per session
   * (OpenCode Go) behave exactly like the server default provider. */
  readonly chatId: string;
  /** Server-level fallback key (openai also honors the standard
   * OPENAI_API_KEY when the user saved no personal key). */
  readonly fallbackApiKey: string;
  /** Server-level fallback base URL for the rare case an openai-compatible
   * user row lost its base URL validation. */
  readonly fallbackBaseUrl: string;
}

/** Builds the LanguageModel for one user's provider choice, validated before
 * persistence - so this factory stays pure and never throws. */
export function createUserChatModel(
  factoryInput: UserChatModelFactoryInput
): LanguageModel {
  const { chatId, fallbackApiKey, fallbackBaseUrl, settings } = factoryInput;
  if (settings.provider === "openai") {
    return createOpenAI({
      apiKey: settings.apiKey ?? fallbackApiKey,
    })(settings.model);
  }
  const compatible = createOpenAICompatible({
    apiKey: settings.apiKey ?? fallbackApiKey,
    baseURL: settings.baseUrl ?? fallbackBaseUrl,
    headers: { "x-opencode-session": chatId },
    includeUsage: true,
    name: "curio-openai-compatible",
  });
  return compatible.chatModel(settings.model);
}
