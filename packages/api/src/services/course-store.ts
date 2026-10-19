import type { Effect } from "effect";
import { Context } from "effect";

import type {
  BadgeAwardInput,
  CourseBadgeRecord,
  CourseChunkPlanInput,
  CourseDeletionInput,
  CourseLessonContentInput,
  CourseLessonDetail,
  CourseLessonLookupInput,
  CourseLookupInput,
  BadgeDeletionInput,
  CourseLessonWrittenResult,
  CourseScaffoldResult,
  CourseStoreFailure,
  CourseSummary,
  CourseCreationInput,
  CourseDetail,
  LessonCompletionInput,
  LessonCompletionResult,
} from "../domain/course";

/** Storage for the user's courses, sections, lessons and badges. */
export interface CourseStoreContract {
  readonly listCourses: (
    userId: string
  ) => Effect.Effect<readonly CourseSummary[], CourseStoreFailure>;
  readonly listBadges: (
    userId: string
  ) => Effect.Effect<readonly CourseBadgeRecord[], CourseStoreFailure>;
  readonly deleteCourse: (
    deletion: CourseDeletionInput
  ) => Effect.Effect<void, CourseStoreFailure>;
  readonly createCourse: (
    creationInput: CourseCreationInput
  ) => Effect.Effect<CourseSummary, CourseStoreFailure>;
  /** Streamed creation, step 1: persist the outline (title + section +
   * lesson shells without content) and hand back the lesson identifiers the
   * model fills one `create_lesson` call at a time. */
  readonly createCourseScaffold: (
    planInput: CourseChunkPlanInput
  ) => Effect.Effect<CourseScaffoldResult, CourseStoreFailure>;
  /** Streamed creation, step 2..N: fill one lesson's finished content. */
  readonly writeCourseLessonContent: (
    writeInput: CourseLessonContentInput
  ) => Effect.Effect<CourseLessonWrittenResult, CourseStoreFailure>;
  /** Sidebar structure for the course page; empty for unknown/no-owner. */
  readonly getCourseStructure: (
    lookup: CourseLookupInput
  ) => Effect.Effect<CourseDetail, CourseStoreFailure>;
  readonly getLesson: (
    lookup: CourseLessonLookupInput
  ) => Effect.Effect<CourseLessonDetail, CourseStoreFailure>;
  readonly completeLesson: (
    completionInput: LessonCompletionInput
  ) => Effect.Effect<LessonCompletionResult, CourseStoreFailure>;
  readonly awardBadge: (
    awardInput: BadgeAwardInput
  ) => Effect.Effect<CourseBadgeRecord, CourseStoreFailure>;
  readonly deleteBadge: (
    deletion: BadgeDeletionInput
  ) => Effect.Effect<void, CourseStoreFailure>;
}

export class CourseStore extends Context.Service<
  CourseStore,
  CourseStoreContract
>()("curio/CourseStore") {}
