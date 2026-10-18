import type { Effect } from "effect";
import { Context } from "effect";

import type { LessonGenerationFailed } from "../domain/lesson-generation-failed";
import type { CourseNotFound } from "./course-store";

export type LessonGenerationOutcome =
  | {
      readonly kind: "already-filled";
      readonly lessonId: string;
      readonly title: string;
    }
  | {
      readonly kind: "generated";
      readonly lessonId: string;
      readonly title: string;
    }
  | { readonly kind: "nothing-ahead" };

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
