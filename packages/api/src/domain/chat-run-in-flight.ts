import { Data } from "effect";

/**
 * A second generation was submitted for a chat that already has a running
 * agent run. The database refuses the second run; routers answer 409.
 */
export class ChatRunInFlight extends Data.TaggedError("ChatRunInFlight")<{
  readonly chatId: string;
}> {}
