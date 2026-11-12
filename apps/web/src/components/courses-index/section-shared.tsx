/** Shared types and header for the Courses tab sections. */

import type { CourseStatus } from "@curio/api/domain/course";

export { SectionHeader } from "@/components/page-layout";

export interface CourseSummaryView {
  readonly completedLessonCount: number;
  readonly id: string;
  readonly lessonCount: number;
  readonly status: CourseStatus;
  readonly title: string;
}

export interface CourseBadgeView {
  readonly id: string;
  readonly label: string;
}

export function progressPercent(course: CourseSummaryView): number {
  if (course.lessonCount === 0) {
    return 0;
  }
  const percent = Math.round(
    (course.completedLessonCount / course.lessonCount) * 100
  );
  return Math.min(percent, 100);
}
