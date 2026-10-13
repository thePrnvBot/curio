import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";

export const CREATE_COURSE_TOOL_NAME = "create_course";

export interface CourseCreationToolRequest {
  readonly description: string | undefined;
  readonly lessons: readonly { kind: string; title: string }[];
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
        "Create a course about one topic for the learner. " +
        "Use this when the user asks to learn something new or asks for a course. " +
        "Build 6 to 10 lessons and vary the lesson kinds: 'video' for taught segments, " +
        "'cards' for bite-sized reads, 'animation' for visual explainers, and 'recap' " +
        "for recall exercises. Lesson titles should be concrete and sequential.",
      execute: async (input) => createScopedCourse(input),
      inputSchema: z.object({
        description: z
          .string()
          .min(1)
          .max(2000)
          .describe("One or two sentences describing what the course covers"),
        lessons: z
          .array(
            z.object({
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
          .max(50)
          .describe("Ordered lessons for the course"),
        title: z
          .string()
          .min(1)
          .max(200)
          .describe("Short course title, e.g. 'Prompt Engineering Basics'"),
      }),
    }),
  };
}
