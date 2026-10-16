import type { Effect } from "effect";
import { Context } from "effect";

import type {
  CourseBadgeRecord,
  CourseChunkPlanInput,
  CourseLessonContentInput,
  CourseLessonWrittenResult,
  CourseCreationInput,
  CourseDetail,
  CourseLessonDetail,
  CourseScaffoldResult,
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
  /** Streamed creation, step 1: persist the outline (title + section +
   * lesson shells without content) and hand back the lesson identifiers the
   * model fills one `create_lesson` call at a time. */
  readonly createCourseScaffold: (
    planInput: CourseChunkPlanInput
  ) => Effect.Effect<CourseScaffoldResult, CourseOperationFailed>;
  /** Streamed creation, step 2..N: fill one lesson's finished content. */
  readonly writeCourseLessonContent: (
    writeInput: CourseLessonContentInput
  ) => Effect.Effect<
    CourseLessonWrittenResult,
    CourseOperationFailed | CourseNotFound | LessonNotFound
  >;
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
  readonly deleteBadge: (
    badgeId: string,
    userId: string
  ) => Effect.Effect<void, CourseOperationFailed | BadgeNotFound>;
}

export class BadgeNotFound extends Error {
  constructor(params: { readonly badgeId: string }) {
    super(`Badge ${params.badgeId} was not found`);
    this.name = "BadgeNotFound";
  }
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
