import { Data } from "effect";

export class LessonNotFound extends Data.TaggedError("LessonNotFound")<{
  readonly courseId: string;
  readonly lessonId: string;
}> {
  override get message(): string {
    return `Lesson ${this.lessonId} does not belong to course ${this.courseId}`;
  }
}
