import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";

export const CREATE_COURSE_TOOL_NAME = "create_course";

const teachingProseSchema = z
  .string()
  .min(1)
  .max(8000)
  .describe("Teaching prose in markdown");

const videoContentSchema = z.object({
  body: teachingProseSchema,
  kind: z.literal("video"),
  videoUrl: z.string().min(1).max(2000).optional(),
});

const cardsContentSchema = z.object({
  body: teachingProseSchema.optional(),
  cards: z
    .array(
      z.object({
        body: z.string().min(1).max(2000),
        title: z.string().min(1).max(200),
      })
    )
    .min(1)
    .max(10),
  kind: z.literal("cards"),
});

const animationContentSchema = z.object({
  body: teachingProseSchema,
  html: z
    .string()
    .min(1)
    .max(60000)
    .describe(
      "Self-contained HTML document (inline styles/scripts) that plays the teaching animation"
    ),
  kind: z.literal("animation"),
});

const recapContentSchema = z.object({
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

const guidedExplanationSchema = z.object({
  intro: z.string().max(2000).optional(),
  kind: z.literal("guided-explanation"),
  steps: z
    .array(
      z.object({
        durationMs: z.number().int().min(1000).max(600000).optional(),
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

const lessonContentSchema = z.discriminatedUnion("kind", [
  videoContentSchema,
  cardsContentSchema,
  animationContentSchema,
  recapContentSchema,
  guidedExplanationSchema,
]);

/**
 * Matches the CourseCreationInput the CourseStore accepts — sections of
 * lessons, each lesson shipping its own structured content.
 */
export interface CourseCreationToolRequest {
  readonly description: string | undefined;
  readonly sections: readonly {
    readonly lessons: readonly {
      readonly content:
        | { readonly kind: "video"; body: string; videoUrl?: string }
        | { readonly kind: "cards"; body?: string; cards: readonly { title: string; body: string }[] }
        | { readonly kind: "animation"; body: string; html: string }
        | {
            readonly kind: "recap";
            readonly questions: readonly {
              readonly answerIndex: number;
              readonly explanation?: string;
              readonly options: readonly string[];
              readonly prompt: string;
            }[];
          }
        | {
            readonly kind: "guided-explanation";
            readonly intro?: string;
            readonly steps: readonly {
              readonly durationMs?: number;
              readonly narration: string;
              readonly visual: {
                readonly kind: "code" | "markdown";
                readonly language?: string;
                readonly source: string;
              };
            }[];
          };
      readonly kind: string;
      readonly title: string;
    }[];
    readonly title: string;
  }[];
  readonly title: string;
}

export interface CourseCreationToolResult {
  readonly course: {
    readonly id: string;
    readonly lessonCount: number;
    readonly title: string;
  };
}

/**
 * Wires the Director's course creation into the chat toolset. The callback is
 * provided by the web app, which scopes the CourseStore to the logged-in user
 * through the Curio runtime.
 */
export function createCourseTool(
  createScopedCourse: (
    creationRequest: CourseCreationToolRequest
  ) => Promise<CourseCreationToolResult>
): ToolSet {
  return {
    [CREATE_COURSE_TOOL_NAME]: tool({
      description:
        "Create a full course for the learner: an LMS-style course page with " +
        "sections (sidebar headings), lessons (subheadings) and finished " +
        "content for every lesson. Use it when the user asks to learn " +
        "something or asks for a course. Build 3 to 6 sections " +
        "(each a coherent theme) with 8 to 12 lessons total, mixing kinds: " +
        "'video' for taught walkthroughs (body prose, optional videoUrl), " +
        "'cards' for bite-sized reads (a deck of title+body cards), " +
        "'animation' for an interactive explainer (self-contained HTML with " +
        "inline styles/scripts shown on an iframe), 'recap' for graded " +
        "recall exercises (2-4 questions with options and answerIndex), and " +
        "'guided-explanation' for concept or code walkthroughs taught step " +
        "by step - 3 to 10 narration beats, each showing the code or prose " +
        "on screen while the narration reads it. " +
        "Every lesson MUST include content: never create lessons without it.",
      execute: async (input) => createScopedCourse(input),
      inputSchema: z.object({
        description: z
          .string()
          .min(1)
          .max(2000)
          .describe("One or two sentences describing what the course covers"),
        sections: z
          .array(
            z.object({
              lessons: z
                .array(
                  z.object({
                    content: lessonContentSchema,
                    kind: z
                      .enum([
                        "video",
                        "cards",
                        "animation",
                        "recap",
                        "guided-explanation",
                      ])
                      .describe("How this lesson is delivered"),
                    title: z
                      .string()
                      .min(1)
                      .max(200)
                      .describe("Concrete lesson title, e.g. 'Recap: naming rules'"),
                  })
                )
                .min(1)
                .max(20),
              title: z
                .string()
                .min(1)
                .max(200)
                .describe("Sidebar heading, e.g. 'Foundations'"),
            })
          )
          .min(1)
          .max(12)
          .describe("Ordered course sections; each holds the lessons beneath that heading"),
        title: z
          .string()
          .min(1)
          .max(200)
          .describe("Short course title, e.g. 'Prompt Engineering Basics'"),
      }),
    }),
  };
}
