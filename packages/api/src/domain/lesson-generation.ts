import { Data } from "effect";

import { describeCause } from "./cause-description";

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
  readonly targetKind: string;
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
