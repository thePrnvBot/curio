import { Effect, Option } from "effect";

import type { CourseStoreContract } from "../services/course-store";
import type { LessonCompletionContract } from "../services/lesson-completion";

export interface CourseStoreLessonCompletionConfig {
  readonly courseStore: CourseStoreContract;
}

/**
 * Lesson-completion implementation over `CourseStore`: complete the lesson,
 * and award the course badge exactly when that completion lands the last
 * unfilled lesson.
 */
export function createCourseStoreLessonCompletion(
  config: CourseStoreLessonCompletionConfig
): LessonCompletionContract {
  return {
    completeLesson: (completionInput) =>
      Effect.gen(function* completeLessonAndAwardBadge() {
        const completion =
          yield* config.courseStore.completeLesson(completionInput);
        const awardedBadge = completion.courseCompleted
          ? yield* config.courseStore
              .awardBadge({
                courseId: completion.course.id,
                label: completion.course.title,
                userId: completionInput.userId,
              })
              .pipe(Effect.map(Option.some))
          : Option.none();
        return { awardedBadge, completion };
      }),
  } satisfies LessonCompletionContract;
}
