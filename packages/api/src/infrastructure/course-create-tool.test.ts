import { describe, expect, it, vi } from "vitest";

import {
  CREATE_COURSE_TOOL_NAME,
  CREATE_LESSON_TOOL_NAME,
  createCourseTool,
} from "./course-create-tool";

describe("course-create-tool", () => {
  const chunks = {
    createScopedCourseScaffold: vi.fn().mockResolvedValue({
      course: { id: "course-1", title: "Test Course", lessonCount: 1 },
      lessons: [
        {
          courseId: "course-1",
          id: "lesson-1",
          kind: "cards",
          position: 0,
          sectionTitle: "Intro",
          title: "Welcome",
        },
      ],
    }),
    createScopedCourseLesson: vi.fn().mockResolvedValue({
      done: true,
      lessonId: "lesson-1",
      position: 0,
      title: "Welcome",
    }),
  };

  it("exports both tool names", () => {
    expect(CREATE_COURSE_TOOL_NAME).toBe("create_course");
    expect(CREATE_LESSON_TOOL_NAME).toBe("create_lesson");
  });

  it("returns a ToolSet with the two tools", () => {
    const tools = createCourseTool(chunks);
    expect(tools).toHaveProperty(CREATE_COURSE_TOOL_NAME);
    expect(tools).toHaveProperty(CREATE_LESSON_TOOL_NAME);
  });

  it("validates and forwards a create_course call", async () => {
    const tools = createCourseTool(chunks);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (tools[CREATE_COURSE_TOOL_NAME] as any).execute({
      description: "A test course",
      sections: [
        {
          lessons: [{ kind: "cards", title: "Welcome" }],
          title: "Intro",
        },
      ],
      title: "Test Course",
    });

    expect(chunks.createScopedCourseScaffold).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({ course: expect.objectContaining({ id: "course-1" }) })
    );
  });

  it("rejects a create_course input with empty sections via schema", () => {
    const tools = createCourseTool(chunks);
    const createCourse = tools[CREATE_COURSE_TOOL_NAME];
    expect(createCourse).toBeDefined();
    if (createCourse === undefined) {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = (createCourse as unknown as { inputSchema?: { safeParse: (input: unknown) => { success: boolean } } }).inputSchema;
    expect(schema).toBeDefined();
    if (schema === undefined) {
      return;
    }
    const result = schema.safeParse({
      description: "A test course",
      sections: [],
      title: "Test Course",
    });
    expect(result.success).toBe(false);
  });
});
