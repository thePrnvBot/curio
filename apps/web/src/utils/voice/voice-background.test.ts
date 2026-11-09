import type {
  CourseDetail,
  CourseLessonDetail,
  CourseLessonKind,
  CourseSummary,
  LessonContent,
} from "@curio/api/domain/course";
import { describe, expect, it, vi } from "vitest";

import {
  guidedLessonSentences,
  runVoiceBackgroundSweep,
} from "./voice-background";

function summary(
  id: string,
  status: CourseSummary["status"] = "active"
): CourseSummary {
  return {
    completedLessonCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    description: "",
    id,
    lessonCount: 1,
    status,
    title: id,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function detail(
  lessons: readonly {
    id: string;
    kind: CourseLessonKind;
    hasContent?: boolean;
  }[]
): CourseDetail {
  return {
    course: summary("course-1"),
    sections: [
      {
        id: null,
        lessons: lessons.map((lesson, index) => ({
          completed: false,
          hasContent: lesson.hasContent ?? true,
          id: lesson.id,
          kind: lesson.kind,
          position: index + 1,
          title: lesson.id,
        })),
        title: "Section",
      },
    ],
  };
}

function guidedLesson(
  id: string,
  narration: readonly string[]
): CourseLessonDetail {
  return {
    completed: false,
    content: {
      kind: "guided-explanation",
      steps: narration.map((line) => ({
        narration: line,
        visual: { kind: "markdown", source: "" },
      })),
    },
    courseId: "course-1",
    id,
    kind: "guided-explanation",
    position: 1,
    title: id,
  };
}

const OTHER_CONTENT: LessonContent = {
  body: "No narration here.",
  kind: "video",
};

describe("guidedLessonSentences", () => {
  it("flattens every step into player sentences", () => {
    expect(
      guidedLessonSentences({
        kind: "guided-explanation",
        steps: [
          {
            narration: "First sentence. Second sentence!",
            visual: { kind: "markdown", source: "" },
          },
          {
            narration: "Third sentence?",
            visual: { kind: "markdown", source: "" },
          },
        ],
      })
    ).toEqual(["First sentence.", "Second sentence!", "Third sentence?"]);
  });

  it("returns nothing for other lesson kinds and empty content", () => {
    expect(guidedLessonSentences(OTHER_CONTENT)).toEqual([]);
    expect(guidedLessonSentences(null)).toEqual([]);
  });
});

describe("runVoiceBackgroundSweep", () => {
  it("synthesizes guided lessons in order and skips other kinds", async () => {
    const synthesized: string[] = [];
    const result = await runVoiceBackgroundSweep({
      getCourse: () =>
        Promise.resolve(
          detail([
            { id: "video-1", kind: "video" },
            { id: "guided-1", kind: "guided-explanation" },
            {
              id: "empty-guided",
              hasContent: false,
              kind: "guided-explanation",
            },
          ])
        ),
      getLesson: ({ lessonId }) =>
        Promise.resolve(guidedLesson(lessonId, ["One. Two.", "Two."])),
      listCourses: () => Promise.resolve([summary("course-1")]),
      synthesize: (text) => {
        synthesized.push(text);
        return Promise.resolve({});
      },
    });

    expect(synthesized).toEqual(["One.", "Two."]);
    expect(result).toMatchObject({
      cancelled: false,
      lessonsVisited: 1,
      linesQueued: 2,
    });
  });

  it("leaves completed courses to the player's on-open prefetch", async () => {
    const getCourse = vi.fn();
    const result = await runVoiceBackgroundSweep({
      getCourse,
      getLesson: () => Promise.resolve(guidedLesson("guided-1", ["One."])),
      listCourses: () => Promise.resolve([summary("old", "completed")]),
      synthesize: () => Promise.resolve({}),
    });

    expect(getCourse).not.toHaveBeenCalled();
    expect(result.lessonsVisited).toBe(0);
  });

  it("continues after a lesson fetch fails", async () => {
    const synthesized: string[] = [];
    const result = await runVoiceBackgroundSweep({
      getCourse: () =>
        Promise.resolve(
          detail([
            { id: "broken", kind: "guided-explanation" },
            { id: "guided-1", kind: "guided-explanation" },
          ])
        ),
      getLesson: ({ lessonId }) =>
        lessonId === "broken"
          ? Promise.reject(new Error("boom"))
          : Promise.resolve(guidedLesson(lessonId, ["Works."])),
      listCourses: () => Promise.resolve([summary("course-1")]),
      synthesize: (text) => {
        synthesized.push(text);
        return Promise.resolve({});
      },
    });

    expect(synthesized).toEqual(["Works."]);
    expect(result.failedLessons).toBe(1);
    expect(result.linesQueued).toBe(1);
  });

  it("stops as soon as cancellation is observed", async () => {
    let calls = 0;
    let cancelled = false;
    const result = await runVoiceBackgroundSweep({
      getCourse: () =>
        Promise.resolve(
          detail([{ id: "guided-1", kind: "guided-explanation" }])
        ),
      getLesson: () =>
        Promise.resolve(guidedLesson("guided-1", ["One.", "Two."])),
      isCancelled: () => cancelled,
      listCourses: () => Promise.resolve([summary("course-1")]),
      synthesize: () => {
        calls += 1;
        cancelled = true;
        return Promise.resolve({});
      },
    });

    expect(calls).toBe(1);
    expect(result.cancelled).toBe(true);
  });
});
