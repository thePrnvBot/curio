import type { Effect } from "effect";
import { Context } from "effect";

import type {
  CourseBadgeRecord,
  CourseCreationInput,
  CourseLessonRecord,
  CourseSummary,
} from "../domain/course";
import type { CourseOperationFailed } from "../domain/course-operation-failed";

export interface CourseStoreContract {
  readonly listCourses: (
    userId: string
  ) => Effect.Effect<readonly CourseSummary[], CourseOperationFailed>;
  readonly listLessons: (
    courseId: string
  ) => Effect.Effect<readonly CourseLessonRecord[], CourseOperationFailed>;
  readonly listBadges: (
    userId: string
  ) => Effect.Effect<readonly CourseBadgeRecord[], CourseOperationFailed>;
  readonly createCourse: (
    creationInput: CourseCreationInput
  ) => Effect.Effect<CourseSummary, CourseOperationFailed>;
  readonly awardBadge: (
    awardInput: {
      readonly courseId: string | null;
      readonly label: string;
      readonly userId: string;
    }
  ) => Effect.Effect<CourseBadgeRecord, CourseOperationFailed>;
}

export class CourseStore extends Context.Service<CourseStore, CourseStoreContract>()(
  "curio/CourseStore"
) {}
