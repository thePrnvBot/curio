import type { Effect } from "effect";
import { Context } from "effect";

import type { CourseNotFound } from "../domain/course";
import type {
  LessonGenerationFailed,
  LessonGenerationOutcome,
  LessonGenerationSchedule,
} from "../domain/lesson-generation";

export interface LessonGeneratorContract {
  /**
   * Progressive course filling: looks at the lesson the reader is on and
   * generates the nearest still-unfilled lesson at or after it. One lesson
   * per call.
   */
  readonly generateNextLessonModule: (input: {
    readonly courseId: string;
    readonly currentLessonId: string;
    readonly userId: string;
  }) => Effect.Effect<
    LessonGenerationOutcome,
    LessonGenerationFailed | CourseNotFound
  >;

  /**
   * Answers immediately after resolving the target and forks the generation
   * as a detached fiber, so closing the page or losing the request never
   * cancels the model work. Repeated calls for the same course are
   * deduplicated; the frontend polls for the filled content.
   */
  readonly scheduleNextLessonModule: (input: {
    readonly courseId: string;
    readonly currentLessonId: string;
    readonly userId: string;
  }) => Effect.Effect<
    LessonGenerationSchedule,
    LessonGenerationFailed | CourseNotFound
  >;
}

export class LessonGenerator extends Context.Service<
  LessonGenerator,
  LessonGeneratorContract
>()("curio/LessonGenerator") {}
