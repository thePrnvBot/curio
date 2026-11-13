import { Output, generateText } from "ai";
import type { LanguageModel } from "ai";
import { Effect } from "effect";

import { lessonContentSchema } from "../domain/lesson-content";
import type { LessonContentToolPayload } from "../domain/lesson-content";
import { LessonGenerationFailed } from "../domain/lesson-generation";
import type { LessonGenerationBrief } from "../domain/lesson-generation";
import { CURIO_BASELINE_STYLE } from "./curio-baseline-style";
import { lessonVideoQuery } from "./lesson-video-search";
import type { LessonVideo } from "./lesson-video-search";

export interface GenerateTextLessonContentConfig {
  readonly findVerifiedVideo: (
    query: string
  ) => Effect.Effect<LessonVideo | null>;
  readonly resolveChatModel: Effect.Effect<LanguageModel>;
}

const LESSON_GENERATOR_INSTRUCTIONS =
  "You write the finished content of ONE lesson for Curio, an AI learning app. " +
  "The lesson kind and the course outline are given; produce complete, polished " +
  "teaching content that matches the kind exactly, following the field " +
  "descriptions in the schema precisely.\n\n" +
  "Kind contracts:\n" +
  "- video: teaching prose (body) that walks through the topic end to end. When " +
  "a verified video is supplied in the prompt, set videoUrl to EXACTLY that URL " +
  "and keep the prose consistent with what the video teaches; never invent a " +
  "video URL.\n" +
  "- cards: an optional short intro (body) plus 3-8 bite-sized cards, each a " +
  "short title and a 1-3 sentence body.\n" +
  "- animation: a short body plus ONE self-contained HTML document (inline " +
  "styles/scripts) that plays an interactive teaching animation.\n" +
  "- recap: 2-4 multiple-choice questions (options, answerIndex, one-sentence " +
  "explanation each) that check the material covered so far.\n" +
  "- guided-explanation: 4-8 sequential steps. Each step is one narration beat " +
  "(one or two spoken sentences) plus a visual that ADDS information beyond the " +
  "narration: a SHORT code excerpt, a formula, or compact notes/a table. Never " +
  "repeat the narration text in the visual; code excerpts stay under 80 lines. " +
  "For every code visual set visual.focus.lines to the 1-based line number(s) the " +
  "narration is currently explaining - usually exactly one line, counted from the " +
  "first line of the excerpt with blank lines included - and set " +
  "visual.focus.cursor.token to the exact code text being discussed, copied " +
  "character-for-character from the excerpt (e.g. 'unknown', 'items.map' or " +
  "'error.message'). The token is located in the source itself, so prefer it over " +
  "counting columns; line/column/length are only fallbacks. Write narration as plain " +
  "spoken sentences: no markdown, backticks, bullet symbols or literal operator " +
  "strings, and say code names as natural words. Reuse the same source across " +
  "consecutive steps that continue one walkthrough so the highlight and floating " +
  "cursor travel across the panel instead of the panel remounting. When every step " +
  "reuses one excerpt, set code { language, source } ONCE at the lesson level and " +
  "omit visual.source from the steps; each step then only carries narration and " +
  "focus. That keeps the payload small without changing what is rendered.\n\n" +
  "For animation HTML, embed this exact baseline stylesheet inside <head> and " +
  `build only on its variables:
  
${CURIO_BASELINE_STYLE}
` +
  "The content must read as finished teaching material — never placeholders, " +
  "never meta commentary about writing the lesson, no markdown fences around " +
  "code fields.";

function renderPrompt(
  brief: LessonGenerationBrief,
  verifiedVideo: LessonVideo | null
): string {
  const outline = brief.outlineLines.join("\n");
  const continuity =
    brief.previousLessonTitle === null
      ? "It is the first lesson of the course."
      : `It directly follows "${brief.previousLessonTitle}" — keep continuity, build on it, and avoid re-explaining it at length.`;
  let videoLines: readonly string[] = [];
  if (verifiedVideo !== null) {
    videoLines = [
      "Verified video for this lesson (already checked for popularity and topical fit):",
      `- Title: ${verifiedVideo.title}`,
      `- Channel: ${verifiedVideo.channel}`,
      `- Views: ${verifiedVideo.views ?? "unknown"}`,
      `- Published: ${verifiedVideo.publishedAt ?? "unknown"}`,
      `- URL: ${verifiedVideo.videoUrl}`,
      ...(verifiedVideo.description === null
        ? []
        : [`- Description: ${verifiedVideo.description.slice(0, 600)}`]),
      "Set videoUrl to exactly this URL and keep the prose consistent with what this video teaches.",
    ];
  } else if (brief.targetKind === "video") {
    videoLines = [
      "No video could be verified for this lesson. Do not invent a URL; omit videoUrl.",
    ];
  }
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
    ...(videoLines.length === 0 ? [] : ["", ...videoLines]),
  ].join("\n");
}

export function createGenerateTextLessonContent(
  config: GenerateTextLessonContentConfig
): (
  brief: LessonGenerationBrief
) => Effect.Effect<LessonContentToolPayload, LessonGenerationFailed> {
  return (brief) =>
    Effect.gen(function* generateLessonContent() {
      const model = yield* config.resolveChatModel;
      const verifiedVideo =
        brief.targetKind === "video"
          ? yield* config
              .findVerifiedVideo(lessonVideoQuery(brief))
              .pipe(Effect.catch(() => Effect.succeed(null)))
          : null;
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
            prompt: renderPrompt(brief, verifiedVideo),
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
      // The verified URL wins over anything the model typed: research happened
      // before generation, so the embed is known to exist and be on-topic. A
      // model-authored URL with no verification behind it is dropped instead of
      // shipping an unverified video.
      if (payload.kind === "video") {
        return verifiedVideo === null
          ? { body: payload.body, kind: "video" }
          : { ...payload, videoUrl: verifiedVideo.videoUrl };
      }
      return payload;
    });
}
