import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";

import { lessonContentSchema } from "../domain/lesson-content";
import type { LessonContentToolPayload } from "../domain/lesson-content";

export const CREATE_COURSE_TOOL_NAME = "create_course";
export const CREATE_LESSON_TOOL_NAME = "create_lesson";

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
        "with its finished content. Call once per lesson, in order. " +
        "Pass content as a JSON object, never as a stringified JSON blob. " +
        "For a guided-explanation that walks one code excerpt, set content.code " +
        "once and omit visual.source from each step; steps then only need " +
        "narration and visual.focus, which keeps the tool call small.",
      execute: async (input) => chunks.createScopedCourseLesson(input),
      inputSchema: z.object({
        content: lessonContentSchema,
        courseId: z.string().min(1).max(64),
        lessonId: z.string().min(1).max(64),
      }),
    }),
  };
}
