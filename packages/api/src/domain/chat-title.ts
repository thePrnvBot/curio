import { Data } from "effect";

import { describeCause } from "./cause-description";

export interface ChatTitleCompositionRequest {
  /** Chat id — some gateways route model requests per conversation. */
  readonly chatId: string;
  /** The first user message text, capped by the caller. */
  readonly userText: string;
  /** The first assistant reply text, capped by the caller. */
  readonly assistantText: string;
}

export interface ChatTitleCompositionResult {
  readonly title: string;
}

export class TitleCompositionFailed extends Data.TaggedError(
  "TitleCompositionFailed"
)<{
  readonly chatId: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Failed to compose chat title — ${describeCause(this.cause)}`;
  }
}
