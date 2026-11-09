import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

import { ModelCredentialRequired } from "../domain/model-settings";

export interface OpenAiChatModelConfig {
  readonly model: string;
  readonly provider: "openai";
  /** Personal key; null falls back to the fixed OpenAI deployment key. */
  readonly apiKey: string | null;
  /** Gateways that route per conversation receive the chat id under this
   * header, making per-user models behave exactly like the server default. */
  readonly sessionHeaderName: string;
}

export interface OpenAiCompatibleChatModelConfig {
  readonly model: string;
  readonly provider: "openai-compatible";
  /**
   * Never nullable: a compatible endpoint is user-controlled, so the caller
   * must fail with ModelCredentialRequired before building the model.
   */
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly sessionHeaderName: string;
}

export type UserChatModelConfig =
  | OpenAiChatModelConfig
  | OpenAiCompatibleChatModelConfig;

export interface ServerFallbacks {
  /** Only the fixed OpenAI provider may use the deployment key. */
  readonly serverOpenAiApiKey: string;
}

/**
 * Builds the LanguageModel for one user's provider choice.
 *
 * The discriminated config makes a credential-less compatible endpoint
 * unrepresentable, and the runtime guard fails closed for values that bypassed
 * the type (persisted rows written before validation, untyped callers). Server
 * fallbacks are only accepted by the fixed OpenAI overload, so the compatible
 * branch has no deployment-key parameter at all.
 */
export function createUserChatModel(
  settings: OpenAiChatModelConfig,
  chatId: string,
  fallbacks: ServerFallbacks
): LanguageModel;
export function createUserChatModel(
  settings: OpenAiCompatibleChatModelConfig,
  chatId: string
): LanguageModel;
export function createUserChatModel(
  settings: UserChatModelConfig,
  chatId: string,
  fallbacks?: ServerFallbacks
): LanguageModel {
  if (settings.provider === "openai") {
    if (fallbacks === undefined) {
      throw new Error("The fixed OpenAI provider requires server fallbacks");
    }
    return createOpenAI({
      apiKey: settings.apiKey ?? fallbacks.serverOpenAiApiKey,
    })(settings.model);
  }

  if (
    typeof settings.apiKey !== "string" ||
    settings.apiKey.trim() === "" ||
    typeof settings.baseUrl !== "string" ||
    settings.baseUrl.trim() === ""
  ) {
    throw new ModelCredentialRequired({
      baseUrl: typeof settings.baseUrl === "string" ? settings.baseUrl : "",
      provider: settings.provider,
    });
  }

  const compatible = createOpenAICompatible({
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl,
    headers: { [settings.sessionHeaderName]: chatId },
    includeUsage: true,
    name: "curio-openai-compatible",
  });
  return compatible.chatModel(settings.model);
}
