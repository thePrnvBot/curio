import { Data } from "effect";

export class CourseNotFound extends Data.TaggedError("CourseNotFound")<{
  readonly courseId: string;
}> {
  override get message(): string {
    return `Course ${this.courseId} was not found`;
  }
}
