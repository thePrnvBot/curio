export const COURSE_LESSON_KINDS = [
  "video",
  "cards",
  "animation",
  "recap",
] as const;

export type CourseLessonKind = (typeof COURSE_LESSON_KINDS)[number];

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
  readonly lessons: readonly CourseLessonInput[];
}

export interface CourseLessonInput {
  readonly kind: CourseLessonKind;
  readonly title: string;
}
