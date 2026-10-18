import { Output, generateText } from "ai";
import type { LanguageModel } from "ai";
import { Effect } from "effect";

import { CURIO_BASELINE_STYLE } from "./generate-text-artifact-generator";
import { lessonContentSchema } from "./course-create-tool";
import type { LessonContentToolPayload } from "./course-create-tool";
import { LessonGenerationFailed } from "../domain/lesson-generation-failed";

export interface LessonGenerationBrief {
  readonly courseDescription: string;
  readonly courseTitle: string;
  /** Ordered outline lines, e.g. `3. [Foundations] video: "Variables 101"`. */
  readonly outlineLines: readonly string[];
  readonly previousLessonTitle: string | null;
  readonly targetKind: string;
  readonly targetTitle: string;
}

export interface GenerateTextLessonContentConfig {
  readonly resolveChatModel: Effect.Effect<LanguageModel>;
}

const LESSON_GENERATOR_INSTRUCTIONS =
  "You write the finished content of ONE lesson for Curio, an AI learning app. " +
  "The lesson kind and the course outline are given; produce complete, polished " +
  "teaching content that matches the kind exactly, following the field " +
  "descriptions in the schema precisely.\n\n" +
  "Kind contracts:\n" +
  "- video: teaching prose (body) that walks through the topic end to end. " +
  "Include videoUrl only when a real, well-known URL is certain; otherwise omit it.\n" +
  "- cards: an optional short intro (body) plus 3-8 bite-sized cards, each a " +
  "short title and a 1-3 sentence body.\n" +
  "- animation: a short body plus ONE self-contained HTML document (inline " +
  "styles/scripts) that plays an interactive teaching animation.\n" +
  "- recap: 2-4 multiple-choice questions (options, answerIndex, one-sentence " +
  "explanation each) that check the material covered so far.\n" +
  "- guided-explanation: 4-8 sequential steps. Each step is one narration beat " +
  "(one or two spoken sentences) plus a visual that ADDS information beyond the " +
  "narration: a SHORT code excerpt, a formula, or compact notes/a table. Never " +
  "repeat the narration text in the visual; code excerpts stay under 80 lines.\n\n" +
  "For animation HTML, embed this exact baseline stylesheet inside <head> and " +
  `build only on its variables:
  
${CURIO_BASELINE_STYLE}
` +
  "The content must read as finished teaching material — never placeholders, " +
  "never meta commentary about writing the lesson, no markdown fences around " +
  "code fields.";

function renderPrompt(brief: LessonGenerationBrief): string {
  const outline = brief.outlineLines.join("\n");
  const continuity =
    brief.previousLessonTitle === null
      ? "It is the first lesson of the course."
      : `It directly follows "${brief.previousLessonTitle}" — keep continuity, build on it, and avoid re-explaining it at length.`;
  return [
    `Course: ${brief.courseTitle}`,
    brief.courseDescription,
    "",
    "Course outline (in order):",
    outline,
    "",
    "Write the content for this lesson:",
    `Title: "${brief.targetTitle}"`,
    `Kind: ${brief.targetKind}`,
    continuity,
  ].join("\n");
}

export function createGenerateTextLessonContent(
  config: GenerateTextLessonContentConfig
): (brief: LessonGenerationBrief) => Effect.Effect<
  LessonContentToolPayload,
  LessonGenerationFailed
> {
  return (brief) =>
    Effect.gen(function* generateLessonContent() {
      const model = yield* config.resolveChatModel;
      const payload: LessonContentToolPayload = yield* Effect.tryPromise({
        catch: (cause: unknown) =>
          new LessonGenerationFailed({
            cause,
            lessonTitle: brief.targetTitle,
          }),
        try: async () => {
          const generationResult = await generateText({
            instructions: LESSON_GENERATOR_INSTRUCTIONS,
            model,
            output: Output.object({
              description: `Finished content for the ${brief.targetKind} lesson "${brief.targetTitle}".`,
              name: "LessonContent",
              schema: lessonContentSchema,
            }),
            prompt: renderPrompt(brief),
          });
          return generationResult.output;
        },
      });
      if (payload.kind !== brief.targetKind) {
        return yield* new LessonGenerationFailed({
          cause: `generated kind "${payload.kind}" does not match the lesson kind "${brief.targetKind}"`,
          lessonTitle: brief.targetTitle,
        });
      }
      return payload;
    });
}
