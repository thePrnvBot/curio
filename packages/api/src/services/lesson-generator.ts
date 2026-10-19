import type { Effect } from "effect";
import { Context } from "effect";

import type { CourseNotFound } from "../domain/course";
import type {
  LessonGenerationFailed,
  LessonGenerationOutcome,
} from "../domain/lesson-generation";

export interface LessonGeneratorContract {
  /**
   * Progressive course filling: looks at the lesson the reader is on and, if
   * it is still an unfilled skeleton, generates its content; otherwise does
   * the same for the lesson immediately after it. One lesson per call — the
   * course page re-invokes as the reader advances, so generation stays one
   * step ahead instead of running the whole course.
   */
  readonly generateNextLessonModule: (input: {
    readonly courseId: string;
    readonly currentLessonId: string;
    readonly userId: string;
  }) => Effect.Effect<
    LessonGenerationOutcome,
    LessonGenerationFailed | CourseNotFound
  >;
}

export class LessonGenerator extends Context.Service<
  LessonGenerator,
  LessonGeneratorContract
>()("curio/LessonGenerator") {}
