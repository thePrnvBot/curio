import { Context } from "effect";
import type { Effect } from "effect";

import type {
  ChatTitleCompositionRequest,
  ChatTitleCompositionResult,
} from "../domain/structured-generation-data";
import type { TitleCompositionFailed } from "../domain/title-composition-failed";

export interface ChatTitleComposerContract {
  /**
   * Composes a short conversation title from the first exchange using
   * structured generation.
   */
  readonly compose: (
    request: ChatTitleCompositionRequest
  ) => Effect.Effect<ChatTitleCompositionResult, TitleCompositionFailed>;
}

export class ChatTitleComposer extends Context.Service<
  ChatTitleComposer,
  ChatTitleComposerContract
>()("curio/ChatTitleComposer") {}
