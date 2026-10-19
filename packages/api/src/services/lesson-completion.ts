import type { Effect, Option } from "effect";
import { Context } from "effect";

import type {
  BadgeNotFound,
  CourseBadgeRecord,
  CourseNotFound,
  CourseOperationFailed,
  LessonCompletionInput,
  LessonCompletionResult,
  LessonNotFound,
} from "../domain/course";

/**
 * One lesson completion and its course badge, decided in one place. The
 * "award the badge exactly when the last lesson lands" rule is course
 * business logic, not route plumbing — it used to live inline in the
 * courses router.
 */
export interface LessonCompletionContract {
  readonly completeLesson: (
    completionInput: LessonCompletionInput
  ) => Effect.Effect<
    {
      /** none until the last lesson of the course lands. */
      readonly awardedBadge: Option.Option<CourseBadgeRecord>;
      readonly completion: LessonCompletionResult;
    },
    CourseOperationFailed | CourseNotFound | LessonNotFound | BadgeNotFound
  >;
}

export class LessonCompletion extends Context.Service<
  LessonCompletion,
  LessonCompletionContract
>()("curio/LessonCompletion") {}
