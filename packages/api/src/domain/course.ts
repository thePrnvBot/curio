import type { LessonContent } from "@curio/db/schema/course";
import { Data } from "effect";

import { describeCause } from "./cause-description";

export const COURSE_LESSON_KINDS = [
  "video",
  "cards",
  "animation",
  "recap",
  "guided-explanation",
] as const;

export type CourseLessonKind = (typeof COURSE_LESSON_KINDS)[number];

/** The model supplies lesson kinds as free strings; anything unrecognized
 * degrades to `cards` rather than failing the whole creation. */
export function normalizeLessonKind(kind: string): CourseLessonKind {
  return COURSE_LESSON_KINDS.find((candidate) => candidate === kind) ?? "cards";
}

export class CourseOperationFailed extends Data.TaggedError(
  "CourseOperationFailed"
)<{
  readonly operation: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Course operation "${this.operation}" failed: ${describeCause(
      this.cause
    )}`;
  }
}
export class CourseNotFound extends Data.TaggedError("CourseNotFound")<{
  readonly courseId: string;
}> {
  override get message(): string {
    return `Course ${this.courseId} was not found`;
  }
}

export class LessonNotFound extends Data.TaggedError("LessonNotFound")<{
  readonly courseId: string;
  readonly lessonId: string;
}> {
  override get message(): string {
    return `Lesson ${this.lessonId} does not belong to course ${this.courseId}`;
  }
}

export class BadgeNotFound extends Data.TaggedError("BadgeNotFound")<{
  readonly badgeId: string;
}> {
  override get message(): string {
    return `Badge ${this.badgeId} was not found`;
  }
}

/**
 * Type guard for the lookup failures callers may legitimately need to tell
 * apart from storage failures (routers answer these with 404). Store error
 * wrappers preserve failures matching this guard instead of flattening them
 * into a generic `CourseOperationFailed`.
 */
export function isCourseLookupFailure(
  cause: unknown
): cause is CourseNotFound | LessonNotFound | BadgeNotFound {
  return (
    cause instanceof CourseNotFound ||
    cause instanceof LessonNotFound ||
    cause instanceof BadgeNotFound
  );
}

/** The closed set of failures any course-store operation can fail with. */
export type CourseStoreFailure =
  | CourseOperationFailed
  | CourseNotFound
  | LessonNotFound
  | BadgeNotFound;

export type {
  GuidedExplanationStep,
  GuidedExplanationLessonContent,
  LessonContent,
  VideoLessonContent,
  CardLessonContent,
  AnimationLessonContent,
  RecapExercise,
  RecapLessonContent,
} from "@curio/db/schema/course";

export interface CourseSummary {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: string;
  readonly lessonCount: number;
  readonly completedLessonCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CourseLessonRecord {
  readonly id: string;
  readonly courseId: string;
  readonly position: number;
  readonly kind: CourseLessonKind;
  readonly title: string;
}

export interface CourseBadgeRecord {
  readonly id: string;
  readonly courseId: string | null;
  readonly label: string;
  readonly earnedAt: string;
}

export interface CourseCreationInput {
  readonly userId: string;
  readonly title: string;
  readonly description: string;
  readonly sections: readonly CourseSectionInput[];
}

/* ------------------------- chunked course streaming ------------------------- */

/** Outline-level plan (no lesson content) that opens the streamed flow. */
export interface CourseChunkPlanSection {
  readonly title: string;
  readonly lessons: readonly CourseChunkPlanLesson[];
}

export interface CourseChunkPlanLesson {
  readonly kind: CourseLessonKind;
  readonly title: string;
}

export interface CourseChunkPlanInput {
  readonly description: string;
  readonly sections: readonly CourseChunkPlanSection[];
  readonly title: string;
  readonly userId: string;
}

/** What the plan tool hands back so the model can fill lessons one at a
 * time with `create_lesson`. */
export interface CourseScaffoldLesson {
  readonly courseId: string;
  readonly id: string;
  readonly kind: CourseLessonKind;
  readonly position: number;
  readonly sectionTitle: string;
  readonly title: string;
}

export interface CourseScaffoldResult {
  readonly course: {
    readonly id: string;
    readonly lessonCount: number;
    readonly title: string;
  };
  readonly lessons: readonly CourseScaffoldLesson[];
}

export interface CourseLessonContentInput {
  readonly content: LessonContent;
  readonly courseId: string;
  readonly lessonId: string;
  readonly userId: string;
}

export interface CourseLessonWrittenResult {
  readonly lessonId: string;
  readonly position: number;
  readonly title: string;
}

export interface CourseSectionInput {
  readonly title: string;
  readonly lessons: readonly CourseLessonInput[];
}

export interface CourseLessonInput {
  readonly kind: CourseLessonKind;
  readonly title: string;
  readonly content?: LessonContent;
}

/** Course page shell for the LMS view: sidebar structure plus flags the
 * reader needs; lesson bodies are fetched per lesson. */
export interface CourseDetail {
  readonly course: CourseSummary;
  readonly sections: readonly CourseSectionDetail[];
}

export interface CourseSectionDetail {
  /** Null for the implicit section that groups legacy unsectioned lessons. */
  readonly id: string | null;
  readonly title: string;
  readonly lessons: readonly CourseLessonSummary[];
}

export interface CourseLessonSummary {
  readonly id: string;
  readonly kind: CourseLessonKind;
  readonly title: string;
  readonly position: number;
  readonly completed: boolean;
}

export interface CourseLessonDetail {
  readonly id: string;
  readonly courseId: string;
  readonly kind: CourseLessonKind;
  readonly title: string;
  readonly position: number;
  readonly completed: boolean;
  readonly content: LessonContent | null;
}

export interface LessonCompletionResult {
  readonly course: CourseSummary;
  readonly courseCompleted: boolean;
}

export interface LessonCompletionInput {
  readonly courseId: string;
  readonly lessonId: string;
  readonly userId: string;
}

export interface CourseDeletionInput {
  readonly courseId: string;
  readonly userId: string;
}

export interface CourseLookupInput {
  readonly courseId: string;
  readonly userId: string;
}

export interface CourseLessonLookupInput {
  readonly courseId: string;
  readonly lessonId: string;
  readonly userId: string;
}

export interface BadgeDeletionInput {
  readonly badgeId: string;
  readonly userId: string;
}

export interface BadgeAwardInput {
  readonly courseId: string | null;
  readonly label: string;
  readonly userId: string;
}
