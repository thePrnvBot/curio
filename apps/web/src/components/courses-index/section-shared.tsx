/** Shared types and header for the Courses tab sections. */

import type { CourseStatus } from "@curio/api/domain/course";

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

export function SectionHeader({
  children,
  className,
  note,
}: {
  children: string;
  className?: string;
  note?: string;
}) {
  return (
    <div
      className={`mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 ${className ?? ""}`}
    >
      <h2 className="text-muted-foreground text-sm font-medium tracking-widest uppercase">
        {children}
      </h2>
      {note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
    </div>
  );
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
