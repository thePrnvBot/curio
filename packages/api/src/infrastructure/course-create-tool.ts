import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";

export const CREATE_COURSE_TOOL_NAME = "create_course";
export const CREATE_LESSON_TOOL_NAME = "create_lesson";

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
 * Chunked creation: `create_course` carries an outline (no lesson content)
 * and persists the course shell immediately; `create_lesson` streams each
 * lesson's finished content in a follow-up call, so the learner's course
 * page builds up live instead of one giant generation.
 */
export interface CourseChunkPlanToolSection {
  readonly lessons: readonly {
    readonly kind: string;
    readonly title: string;
  }[];
  readonly title: string;
}

export interface CourseChunkPlanToolRequest {
  readonly description: string | undefined;
  readonly sections: readonly CourseChunkPlanToolSection[];
  readonly title: string;
}

export interface CourseScaffoldToolResult {
  readonly course: {
    readonly id: string;
    readonly lessonCount: number;
    readonly title: string;
  };
  readonly lessons: readonly {
    readonly courseId: string;
    readonly id: string;
    readonly kind: string;
    readonly position: number;
    readonly sectionTitle: string;
    readonly title: string;
  }[];
}

/** The structured content payload for one lesson, zod-validated upstream. */
export type LessonContentToolPayload = {
  readonly kind: "video";
  readonly body: string;
  readonly videoUrl?: string;
} | {
  readonly kind: "cards";
  readonly body?: string;
  readonly cards: readonly { readonly body: string; readonly title: string }[];
} | {
  readonly kind: "animation";
  readonly body: string;
  readonly html: string;
} | {
  readonly kind: "recap";
  readonly questions: readonly {
    readonly answerIndex: number;
    readonly explanation?: string;
    readonly options: readonly string[];
    readonly prompt: string;
  }[];
} | {
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

export interface CreateLessonToolRequest {
  readonly content: LessonContentToolPayload;
  readonly courseId: string;
  readonly lessonId: string;
}

export interface CreateLessonToolResult {
  readonly done: boolean;
  readonly lessonId: string;
  readonly position: number;
  readonly title: string;
}

/**
 * Wires the Director's chunked course creation into the chat toolset. The
 * callbacks are provided by the web app, which scopes the CourseStore to the
 * logged-in user through the Curio runtime.
 */
export function createCourseTool(chunks: {
  createScopedCourseLesson: (
    createLessonRequest: CreateLessonToolRequest
  ) => Promise<CreateLessonToolResult>;
  createScopedCourseScaffold: (
    planRequest: CourseChunkPlanToolRequest
  ) => Promise<CourseScaffoldToolResult>;
}): ToolSet {
  return {
    [CREATE_COURSE_TOOL_NAME]: tool({
      description:
        "Step 1 of course creation: register the course SKELETON - just the " +
        "outline. Use it when the user asks to learn something or asks for a " +
        "course. Plan 3 to 6 sections (each a coherent theme) holding 8 to 12 " +
        "lessons total, mixing kinds: 'video' (taught walkthroughs), 'cards' " +
        "(bite-sized reads), 'animation' (interactive HTML explainer), " +
        "'recap' (graded quiz), 'guided-explanation' (narrated step-by-step " +
        "reveal). This call must NOT contain lesson content. Immediately " +
        "afterwards call create_lesson once per lesson id IN ORDER, passing " +
        "the finished content for that lesson each time, until every lesson " +
        "is filled; then tell the user the course is ready in the Courses tab.",
      execute: async (input) => chunks.createScopedCourseScaffold(input),
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
                    kind: z
                      .enum([
                        "video",
                        "cards",
                        "animation",
                        "recap",
                        "guided-explanation",
                      ])
                      .describe("How this lesson will be delivered"),
                    title: z
                      .string()
                      .min(1)
                      .max(200)
                      .describe(
                        "Concrete lesson title, e.g. 'Recap: naming rules'"
                      ),
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
          .describe(
            "Ordered course sections; each holds the lessons beneath that heading"
          ),
        title: z
          .string()
          .min(1)
          .max(200)
          .describe("Short course title, e.g. 'Prompt Engineering Basics'"),
      }),
    }),
    [CREATE_LESSON_TOOL_NAME]: tool({
      description:
        "Step 2 of course creation: fill ONE lesson (by id from create_course) " +
        "with its finished content. Call once per lesson, in order.",
      execute: async (input) => chunks.createScopedCourseLesson(input),
      inputSchema: z.object({
        content: lessonContentSchema,
        courseId: z.string().min(1).max(64),
        lessonId: z.string().min(1).max(64),
      }),
    }),
  };
}
