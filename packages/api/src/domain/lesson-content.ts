import type { LessonContent } from "@curio/db/schema/course";
import { z } from "zod";

/**
 * The lesson content shape lives in this file exactly once: the AI SDK tool
 * and the structured-output lesson generator consume the schema, routers
 * validate request bodies against it, and `LessonContentToolPayload` derives
 * from it — so every consumer of the shape can never drift apart.
 */

const teachingProse = z
  .string()
  .min(1)
  .max(8000)
  .describe("Teaching prose in markdown");

const videoContent = z.object({
  kind: z.literal("video"),
  body: teachingProse,
  videoUrl: z
    .string()
    .min(1)
    .max(2000)
    .optional()
    .describe("Optional embeddable video URL (YouTube link or direct video)"),
});

const cardsContent = z.object({
  kind: z.literal("cards"),
  body: teachingProse.optional(),
  cards: z
    .array(
      z.object({
        body: z.string().min(1).max(2000),
        title: z.string().min(1).max(200),
      })
    )
    .min(1)
    .max(10),
});

const animationContent = z.object({
  kind: z.literal("animation"),
  body: teachingProse,
  html: z
    .string()
    .min(1)
    .max(60_000)
    .describe(
      "Self-contained HTML document (inline styles/scripts) that plays the teaching animation"
    ),
});

const recapContent = z.object({
  kind: z.literal("recap"),
  questions: z
    .array(
      z.object({
        answerIndex: z.number().int().min(0).max(9),
        explanation: z.string().max(2000).optional(),
        options: z.array(z.string().min(1).max(300)).min(2).max(6),
        prompt: z.string().min(1).max(500),
      })
    )
    .min(1)
    .max(10),
});

const guidedExplanationContent = z.object({
  kind: z.literal("guided-explanation"),
  intro: z.string().max(2000).optional(),
  steps: z
    .array(
      z.object({
        durationMs: z.number().int().min(1000).max(600_000).optional(),
        narration: z
          .string()
          .min(1)
          .max(1200)
          .describe(
            "What the narrator says over this step - one or two sentences"
          ),
        visual: z.object({
          kind: z.enum(["code", "markdown"]),
          language: z
            .string()
            .max(40)
            .optional()
            .describe("Syntax hint for code visuals, e.g. 'typescript'"),
          source: z
            .string()
            .min(1)
            .max(8000)
            .describe(
              "What is on screen during this step: a code excerpt, formula, diagram source or structured notes that SUPPORT the narration. Never repeat narration text - the visual must add information the narration alone does not show. Code excerpts under 80 lines; if a markdown visual, prefer a short heading plus a table or code fence, not prose sentences from the narration. Show the last example again only if the step builds on it"
            ),
        }),
      })
    )
    .min(2)
    .max(12)
    .describe(
      "3-10 sequential steps; each is one narration beat with a SHORT code excerpt or prose on screen. Split long walkthroughs into more steps instead of pasting large files"
    ),
});

/** Structured content for one lesson: one variant per lesson kind. */
export const lessonContentSchema = z.discriminatedUnion("kind", [
  videoContent,
  cardsContent,
  animationContent,
  recapContent,
  guidedExplanationContent,
]);

/** Structured content payload for one lesson, validated by the schema above. */
export type LessonContentToolPayload = z.infer<typeof lessonContentSchema>;

/** All lesson kinds the store accepts; the single zod enum lives next to the
 * kind list in ./course. */
export { lessonKindSchema } from "./course";

/**
 * Maps a schema-validated content payload onto the stored `LessonContent`
 * shape (kinds normalize; optional fields get their stored defaults and
 * recap answers are clamped to their option list).
 */
export function toStoredLessonContent(
  rawContent: LessonContentToolPayload
): LessonContent {
  switch (rawContent.kind) {
    case "animation": {
      return {
        body: rawContent.body,
        html: rawContent.html,
        kind: "animation",
      };
    }
    case "cards": {
      return {
        body: rawContent.body,
        cards: rawContent.cards.map((card) => ({
          body: card.body,
          title: card.title,
        })),
        kind: "cards",
      };
    }
    case "guided-explanation": {
      return {
        intro: rawContent.intro,
        kind: "guided-explanation",
        steps: rawContent.steps.map((step) => ({
          durationMs: step.durationMs,
          narration: step.narration,
          visual: {
            kind: step.visual.kind,
            language: step.visual.language,
            source: step.visual.source,
          },
        })),
      };
    }
    case "recap": {
      return {
        kind: "recap",
        questions: rawContent.questions.map((question) => ({
          answerIndex: Math.max(
            0,
            Math.min(question.answerIndex, question.options.length - 1)
          ),
          explanation: question.explanation,
          options: question.options,
          prompt: question.prompt,
        })),
      };
    }
    case "video": {
      return {
        body: rawContent.body,
        kind: "video",
        videoUrl: rawContent.videoUrl,
      };
    }
    // oxlint-disable-next-line eslint/default-case -- exhaustive union arm added for the lint rule; TS still rejects a missing kind as never
    default: {
      const unhandledKind: never = rawContent;
      return unhandledKind;
    }
  }
}
