import { Output, generateText } from "ai";
import type { LanguageModel } from "ai";
import { Effect } from "effect";
import { z } from "zod";

import { TitleCompositionFailed } from "../domain/chat-title";
import type {
  ChatTitleCompositionRequest,
  ChatTitleCompositionResult,
} from "../domain/chat-title";
import type { ChatTitleComposerContract } from "../services/chat-title-composer";

const TITLE_SCHEMA = z.object({
  title: z
    .string()
    .min(1)
    .max(80)
    .describe(
      "A short, specific, human-friendly conversation title of at most six words"
    ),
});

const TITLE_INSTRUCTIONS =
  "You write concise, specific conversation titles. " +
  "Describe the user's goal rather than the topic generically. " +
  "Do not use quotation marks, trailing punctuation, or prefixes like 'Chat:'.";

export interface GenerateTextChatTitleComposerConfig {
  readonly resolveChatModel: Effect.Effect<LanguageModel>;
}

export function createGenerateTextChatTitleComposer(
  config: GenerateTextChatTitleComposerConfig
): ChatTitleComposerContract {
  return {
    compose: (
      request: ChatTitleCompositionRequest
    ): Effect.Effect<ChatTitleCompositionResult, TitleCompositionFailed> =>
      Effect.gen(function* composeTitle() {
        const model = yield* config.resolveChatModel;
        const structuredTitle: ChatTitleCompositionResult =
          yield* Effect.tryPromise({
            catch: (cause: unknown) =>
              new TitleCompositionFailed({
                cause,
                chatId: request.chatId,
              }),
            try: async () => {
              const generationResult = await generateText({
                instructions: TITLE_INSTRUCTIONS,
                model,
                output: Output.object({
                  description: "A short conversation title.",
                  name: "ChatTitle",
                  schema: TITLE_SCHEMA,
                }),
                prompt:
                  `User request:\n${request.userText.slice(0, 2000)}\n\n` +
                  `Assistant reply (excerpt):\n${request.assistantText.slice(0, 2000)}`,
              });
              return generationResult.output;
            },
          });
        return structuredTitle;
      }),
  };
}
