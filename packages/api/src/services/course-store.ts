import type { Effect } from "effect";
import { Context } from "effect";

import type {
  CourseBadgeRecord,
  CourseCreationInput,
  CourseDetail,
  CourseLessonDetail,
  CourseSummary,
  LessonCompletionResult,
} from "../domain/course";
import type { CourseOperationFailed } from "../domain/course-operation-failed";

export interface CourseStoreContract {
  readonly listCourses: (
    userId: string
  ) => Effect.Effect<readonly CourseSummary[], CourseOperationFailed>;
  readonly listBadges: (
    userId: string
  ) => Effect.Effect<readonly CourseBadgeRecord[], CourseOperationFailed>;
  readonly deleteCourse: (
    courseId: string,
    userId: string
  ) => Effect.Effect<void, CourseOperationFailed | CourseNotFound>;
  readonly createCourse: (
    creationInput: CourseCreationInput
  ) => Effect.Effect<CourseSummary, CourseOperationFailed>;
  /** Sidebar structure for the course page; empty for unknown/no-owner. */
  readonly getCourseStructure: (
    courseId: string,
    userId: string
  ) => Effect.Effect<CourseDetail, CourseOperationFailed | CourseNotFound>;
  readonly getLesson: (
    courseId: string,
    lessonId: string,
    userId: string
  ) => Effect.Effect<CourseLessonDetail, CourseOperationFailed | CourseNotFound>;
  readonly completeLesson: (
    courseId: string,
    lessonId: string,
    userId: string
  ) => Effect.Effect<
    LessonCompletionResult,
    CourseOperationFailed | CourseNotFound
  >;
  readonly awardBadge: (awardInput: {
    readonly courseId: string | null;
    readonly label: string;
    readonly userId: string;
  }) => Effect.Effect<CourseBadgeRecord, CourseOperationFailed>;
}

export class CourseNotFound extends Error {
  constructor(params: { readonly courseId: string }) {
    super(`Course ${params.courseId} was not found`);
    this.name = "CourseNotFound";
  }
}

export class LessonNotFound extends Error {
  constructor(params: {
    readonly courseId: string;
    readonly lessonId: string;
  }) {
    super(`Lesson ${params.lessonId} does not belong to course ${params.courseId}`);
    this.name = "LessonNotFound";
  }
}

export class CourseStore extends Context.Service<CourseStore, CourseStoreContract>()(
  "curio/CourseStore"
) {}
