import type { LessonContent } from "@curio/db/schema/course";

export const COURSE_LESSON_KINDS = ["video", "cards", "animation", "recap"] as const;

export type CourseLessonKind = (typeof COURSE_LESSON_KINDS)[number];

export type { LessonContent, VideoLessonContent, CardLessonContent, AnimationLessonContent, RecapExercise, RecapLessonContent } from "@curio/db/schema/course";

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
