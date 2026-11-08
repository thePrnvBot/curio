import type { LessonContent } from "@curio/db/schema/course";
import { Predicate } from "effect";
import { z } from "zod";

import type { BadgeNotFound } from "./badge-not-found";
import type { CourseNotFound } from "./course-not-found";
import type { CourseOperationFailed } from "./course-operation-failed";
import type { LessonNotFound } from "./lesson-not-found";

export { BadgeNotFound } from "./badge-not-found";
export { CourseNotFound } from "./course-not-found";
export { CourseOperationFailed } from "./course-operation-failed";
export { LessonNotFound } from "./lesson-not-found";

export const COURSE_LESSON_KINDS = [
  "video",
  "cards",
  "animation",
  "recap",
  "guided-explanation",
] as const;

/** All lesson kinds the store accepts. */
export const lessonKindSchema = z.enum(COURSE_LESSON_KINDS);

export type CourseLessonKind = z.infer<typeof lessonKindSchema>;

/** The model supplies lesson kinds as free strings and storage rows may hold
 * legacy values; anything outside the union degrades to `cards` rather than
 * failing the whole operation. `safeParse` keeps the coercion a validated
 * parse instead of chaining a promise-shaped `.catch()`. */
export function normalizeLessonKind(kind: unknown): CourseLessonKind {
  const parsed = lessonKindSchema.safeParse(kind);
  return parsed.success ? parsed.data : "cards";
}

/** Lookup failures callers may legitimately need to tell apart from storage
 * failures (routers answer these with 404): the tags the three tagged classes
 * above carry, checked with the Predicate module helpers instead of a hand
 * rolled `instanceof` chain. Store error wrappers preserve failures matching
 * this guard instead of flattening them into a generic
 * `CourseOperationFailed`. */
const COURSE_LOOKUP_FAILURE_TAGS = [
  "CourseNotFound",
  "LessonNotFound",
  "BadgeNotFound",
] as const;

export function isCourseLookupFailure(
  cause: unknown
): cause is CourseNotFound | LessonNotFound | BadgeNotFound {
  return COURSE_LOOKUP_FAILURE_TAGS.some((tag) =>
    Predicate.isTagged(cause, tag)
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
