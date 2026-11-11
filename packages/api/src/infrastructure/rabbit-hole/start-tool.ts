import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";

import { openRabbitHoleSession } from "./sessions";

export const START_RABBIT_HOLE_TOOL_NAME = "start_rabbit_hole";

export interface StartRabbitHoleToolResult {
  readonly sessionId: string | null;
  readonly status: "ready" | "unavailable";
  readonly topic: string | null;
  readonly message: string;
}

/**
 * Summons the Rabbit Hole window: a disposable, proxied browser the learner
 * drives themselves, with the Director taking notes in the sidebar. The tool
 * returns as soon as the session is live; the digest of the session arrives
 * later as a user message, when the learner chooses recap or course.
 */
export function createRabbitHoleTool({
  chatId,
  userId,
}: {
  readonly chatId: string;
  readonly userId: string;
}): ToolSet {
  return {
    [START_RABBIT_HOLE_TOOL_NAME]: tool({
      description:
        "Open a Rabbit Hole: an interactive, disposable browser window the learner uses to explore the web themselves. " +
        "Every page, media item, highlight and sidebar note is captured, then digested when they exit. " +
        "Use this only when the learner asks to start a Rabbit Hole, asks to browse/explore the web themselves, or wants research they drive personally. " +
        "Do NOT use it for quick lookups you can answer with web_search/web_read. " +
        "After calling it, briefly tell the learner the window is open and let them browse; do not describe pages you cannot see.",
      inputSchema: z.object({
        seedUrls: z
          .array(z.string().min(4).max(2000))
          .max(4)
          .optional()
          .describe(
            "Optional pages to open first, e.g. results from an earlier web_search. Prefer 1-3 strong sources."
          ),
        topic: z
          .string()
          .min(1)
          .max(400)
          .optional()
          .describe(
            "What the learner wants to explore in a sentence or two. Used as the digest heading and to keep the session focused."
          ),
      }),
      execute: ({ seedUrls = [], topic }) => {
        const normalizedTopic = topic?.trim() ?? "";
        try {
          const session = openRabbitHoleSession({
            chatId,
            seedUrls,
            topic: normalizedTopic === "" ? null : normalizedTopic,
            userId,
          });
          const result: StartRabbitHoleToolResult = {
            message:
              "Rabbit Hole is open. The learner is browsing now; stop talking and wait for their session digest.",
            sessionId: session.browser.id,
            status: "ready",
            topic: normalizedTopic === "" ? null : normalizedTopic,
          };
          return result;
        } catch (error: unknown) {
          const detail =
            error instanceof Error
              ? error.message
              : "The Rabbit Hole could not be opened";
          const result: StartRabbitHoleToolResult = {
            message: `${detail} Do not retry immediately; offer web_search or web_read instead.`,
            sessionId: null,
            status: "unavailable",
            topic: normalizedTopic === "" ? null : normalizedTopic,
          };
          return result;
        }
      },
    }),
  };
}
