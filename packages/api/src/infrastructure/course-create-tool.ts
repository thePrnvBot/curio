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

const lessonContentSchema = z.discriminatedUnion("kind", [
  videoContentSchema,
  cardsContentSchema,
  animationContentSchema,
  recapContentSchema,
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
        "inline styles/scripts shown on an iframe), and 'recap' for graded " +
        "recall exercises (2-4 questions with options and answerIndex). " +
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
                      .enum(["video", "cards", "animation", "recap"])
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
