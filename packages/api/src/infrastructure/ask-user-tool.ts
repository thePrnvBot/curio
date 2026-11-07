import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";

/**
 * The AI SDK 7 ask_user tool: pausing the chat to quiz the user on their
 * preferences in the Director.
 *
 * The tool intentionally has NO `execute` — when the model calls it, the step
 * ends and the questions arrive on the client as a `tool-ask_user` part, where
 * the PromptInput renders them as selectable answer chips. The user's answers
 * ride in as the next user message; the pending tool parts are then
 * reconstructed with synthetic outputs before dispatch to the model (see the
 * sanitization in the chat API route).
 */
export const ASK_USER_TOOL_NAME = "ask_user";

export interface AskUserQuestionInput {
  readonly question: string;
  readonly options: readonly string[];
}

export function createAskUserTool(): ToolSet {
  return {
    [ASK_USER_TOOL_NAME]: tool({
      description:
        "Ask the user up to four multiple-choice questions to understand their " +
        "learning goals, level, and preferences. Use this before creating a " +
        "course, and whenever details are needed to proceed. Every question " +
        "MUST include 2 to 4 short answer options.",
      inputSchema: z.object({
        intro: z
          .string()
          .min(1)
          .max(300)
          .describe(
            "One short sentence explaining why you are asking, addressed to the learner"
          ),
        questions: z
          .array(
            z.object({
              options: z
                .array(z.string().min(1).max(80))
                .min(2)
                .max(4)
                .describe("Short, mutually exclusive answer options"),
              question: z
                .string()
                .min(1)
                .max(200)
                .describe("One complete question the learner can read quickly"),
            })
          )
          .min(1)
          .max(4)
          .describe("The questions to ask"),
      }),
    }),
  };
}
