import type { LanguageModel } from "ai";
import { Context } from "effect";
import type { Effect } from "effect";

export interface ChatModelProviderContract {
  /**
   * Resolves the chat model for one conversation. Some gateways (e.g.
   * OpenCode Go) route requests with a per-conversation session header, so the
   * chat id is part of the contract.
   */
  readonly getChatModel: (chatId: string) => Effect.Effect<LanguageModel>;
}

export class ChatModelProvider extends Context.Service<
  ChatModelProvider,
  ChatModelProviderContract
>()("curio/ChatModelProvider") {}
