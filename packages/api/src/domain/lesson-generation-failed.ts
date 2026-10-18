import { Data } from "effect";

export class LessonGenerationFailed extends Data.TaggedError(
  "LessonGenerationFailed"
)<{
  readonly cause: unknown;
  readonly lessonTitle: string;
}> {
  override get message(): string {
    return `Lesson generation failed for "${this.lessonTitle}": ${
      this.cause instanceof Error ? this.cause.message : String(this.cause)
    }`;
  }
}
