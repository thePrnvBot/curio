import { Data } from "effect";

import { describeCause } from "./cause-description";
import type { CourseLessonKind } from "./course";

export class LessonGenerationFailed extends Data.TaggedError(
  "LessonGenerationFailed"
)<{
  readonly cause: unknown;
  readonly lessonTitle: string;
}> {
  override get message(): string {
    return `Lesson generation failed for "${this.lessonTitle}": ${describeCause(
      this.cause
    )}`;
  }
}

export interface LessonGenerationBrief {
  readonly courseDescription: string;
  readonly courseTitle: string;
  /** Ordered outline lines, e.g. `3. [Foundations] video: "Variables 101"`. */
  readonly outlineLines: readonly string[];
  readonly previousLessonTitle: string | null;
  readonly targetKind: CourseLessonKind;
  readonly targetTitle: string;
}

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

/**
 * Result of scheduling background lesson generation. The HTTP request is
 * answered immediately; the course page polls the course structure until the
 * target lesson's `hasContent` flips.
 */
export type LessonGenerationSchedule =
  | {
      readonly kind: "scheduled";
      readonly lessonId: string;
      readonly title: string;
    }
  | {
      readonly kind: "already-filled";
      readonly lessonId: string;
      readonly title: string;
    }
  | { readonly kind: "already-generating" }
  | { readonly kind: "nothing-ahead" };

/**
 * The nearest unfilled lesson at or after the reader's position, resolved
 * before any model work starts.
 */
export interface LessonGenerationTarget {
  readonly brief: LessonGenerationBrief;
  readonly lessonId: string;
  readonly title: string;
}
