import { Badge } from "@curio/ui/components/badge";
import { Link } from "@tanstack/react-router";

import { SectionHeader, progressPercent } from "./section-shared";
import type { CourseSummaryView } from "./section-shared";

function CurrentCourseCard({
  activeCourse,
}: {
  activeCourse: CourseSummaryView;
}) {
  return (
    <Link
      className="hover:border-ring bg-card group block rounded-xl border p-5 transition-shadow hover:shadow-sm md:p-6"
      data-cue="navigate"
      params={{ courseId: activeCourse.id }}
      to="/courses/$courseId"
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <span className="truncate font-medium">{activeCourse.title}</span>
        <Badge>{`${progressPercent(activeCourse)}%`}</Badge>
      </div>
      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${Math.max(progressPercent(activeCourse), 2)}%`,
          }}
        />
      </div>
      <div className="text-muted-foreground group-hover:text-foreground/80 mt-3 flex items-center justify-between gap-4 text-xs transition-colors">
        <span className="truncate">
          {`Completed ${activeCourse.completedLessonCount} of ${activeCourse.lessonCount} lessons`}
        </span>
        <span className="shrink-0">In progress</span>
      </div>
    </Link>
  );
}

export function CurrentCourseSection({
  activeCourse,
  empty,
}: {
  activeCourse: CourseSummaryView | null;
  empty: React.ReactNode;
}) {
  return (
    <section>
      <SectionHeader>Currently learning</SectionHeader>
      {activeCourse === null ? (
        empty
      ) : (
        <CurrentCourseCard activeCourse={activeCourse} />
      )}
    </section>
  );
}
