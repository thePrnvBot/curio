import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { Effect } from "effect";

import type { ChatModelProviderContract } from "../services/chat-model-provider";

export interface OpenAiCompatibleProviderConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly modelId: string;
  /**
   * "chat-completions" hits `{baseUrl}/chat/completions` with the
   * OpenAI-compatible provider (GLM, Kimi, DeepSeek...); "responses" hits
   * `{baseUrl}/responses` with the official OpenAI provider (Grok, GPT...).
   */
  readonly protocol?: "chat-completions" | "responses";
  readonly providerName?: string;
  /**
   * Gateways that route requests per conversation (OpenCode Go expects
   * "x-opencode-session") receive the chat id under this header.
   */
  readonly sessionHeaderName?: string;
}

export function createOpenAiCompatibleChatModelProvider(
  config: OpenAiCompatibleProviderConfig
): ChatModelProviderContract {
  const chatModelCache = new Map<string, LanguageModel>();

  return {
    getChatModel: (chatId: string) =>
      Effect.sync(() => {
        const cachedChatModel = chatModelCache.get(chatId);
        if (cachedChatModel !== undefined) {
          return cachedChatModel;
        }

        const sessionHeaders = config.sessionHeaderName
          ? { [config.sessionHeaderName]: chatId }
          : undefined;

        const chatModelForChat: LanguageModel =
          config.protocol === "responses"
            ? createOpenAI({
                apiKey: config.apiKey,
                baseURL: config.baseUrl,
                ...(sessionHeaders ? { headers: sessionHeaders } : {}),
              })(config.modelId)
            : createOpenAICompatible({
                apiKey: config.apiKey,
                baseURL: config.baseUrl,
                headers: sessionHeaders,
                includeUsage: true,
                name: config.providerName ?? "curio-openai-compatible",
              }).chatModel(config.modelId);

        chatModelCache.set(chatId, chatModelForChat);
        return chatModelForChat;
      }),
  };
}
