import { describe, expect, it } from "vitest";

import { BadgeNotFound } from "./badge-not-found";
import { CourseNotFound } from "./course-not-found";
import {
  COURSE_LESSON_KINDS,
  isCourseLookupFailure,
  lessonKindSchema,
  normalizeLessonKind,
} from "./course";
import { CourseOperationFailed } from "./course-operation-failed";
import { LessonNotFound } from "./lesson-not-found";

describe("course domain", () => {
  describe("lessonKindSchema", () => {
    it("accepts every known lesson kind", () => {
      for (const kind of COURSE_LESSON_KINDS) {
        expect(lessonKindSchema.parse(kind)).toBe(kind);
      }
    });

    it("rejects unknown kinds", () => {
      expect(lessonKindSchema.safeParse("quiz").success).toBe(false);
    });
  });

  describe("normalizeLessonKind", () => {
    it.each(COURSE_LESSON_KINDS)(
      "returns the kind unchanged when it is valid (%s)",
      (kind) => {
        expect(normalizeLessonKind(kind)).toBe(kind);
      }
    );

    it("degrades unknown kinds to cards", () => {
      expect(normalizeLessonKind("quiz")).toBe("cards");
      expect(normalizeLessonKind(null)).toBe("cards");
      expect(normalizeLessonKind(42)).toBe("cards");
    });
  });

  describe("isCourseLookupFailure", () => {
    it("returns true for lookup failures", () => {
      expect(isCourseLookupFailure(new CourseNotFound({ courseId: "1" }))).toBe(true);
      expect(
        isCourseLookupFailure(new LessonNotFound({ courseId: "c1", lessonId: "2" }))
      ).toBe(true);
      expect(isCourseLookupFailure(new BadgeNotFound({ badgeId: "3" }))).toBe(true);
    });

    it("returns false for other course failures", () => {
      expect(
        isCourseLookupFailure(
          new CourseOperationFailed({ operation: "insert", cause: "db down" })
        )
      ).toBe(false);
    });

    it("returns false for non-error values", () => {
      expect(isCourseLookupFailure(null)).toBe(false);
      expect(isCourseLookupFailure(new Error("boom"))).toBe(false);
    });
  });
});
