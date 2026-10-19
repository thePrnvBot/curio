import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { Effect } from "effect";

import type { ChatModelProviderContract } from "../services/chat-model-provider";

/**
 * Gateways that route requests per conversation (OpenCode Go expects this
 * header) receive the chat id under this header name. The server default
 * provider and per-user model builders share the constant so both routes
 * behave identically.
 */
export const OPENCODE_SESSION_HEADER_NAME = "x-opencode-session";

/** Cap on cached per-conversation model instances, so a long-lived server
 * cannot grow the map without bound. */
const MAX_CACHED_CHAT_MODELS = 100;

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
   * Gateways that route requests per conversation receive the chat id under
   * this header; see {@link OPENCODE_SESSION_HEADER_NAME}.
   */
  readonly sessionHeaderName?: string;
}

/** Builds one OpenAI(-compatible) LanguageModel for a conversation-scoped session. */
function buildChatModel(
  config: OpenAiCompatibleProviderConfig,
  chatId: string
): LanguageModel {
  const sessionHeaders = config.sessionHeaderName
    ? { [config.sessionHeaderName]: chatId }
    : undefined;
  return config.protocol === "responses"
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

        const chatModelForChat = buildChatModel(config, chatId);

        // Insertion-order eviction keeps the cache at a fixed ceiling.
        if (chatModelCache.size >= MAX_CACHED_CHAT_MODELS) {
          const oldestChatId = chatModelCache.keys().next().value;
          if (oldestChatId !== undefined) {
            chatModelCache.delete(oldestChatId);
          }
        }
        chatModelCache.set(chatId, chatModelForChat);
        return chatModelForChat;
      }),
  };
}
