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
  /** Gateways that route per conversation receive the chat id under this
   * header, making per-user models behave exactly like the server default. */
  readonly sessionHeaderName: string;
}

/** Builds the LanguageModel for one user's provider choice, validated before
 * persistence — so this factory stays pure and never throws. */
export function createUserChatModel(
  settings: UserChatModelConfig,
  chatId: string,
  fallbacks: { readonly apiKey: string; readonly baseUrl: string }
): LanguageModel {
  if (settings.provider === "openai") {
    return createOpenAI({
      apiKey: settings.apiKey ?? fallbacks.apiKey,
    })(settings.model);
  }
  const compatible = createOpenAICompatible({
    apiKey: settings.apiKey ?? fallbacks.apiKey,
    baseURL: settings.baseUrl ?? fallbacks.baseUrl,
    headers: { [settings.sessionHeaderName]: chatId },
    includeUsage: true,
    name: "curio-openai-compatible",
  });
  return compatible.chatModel(settings.model);
}
