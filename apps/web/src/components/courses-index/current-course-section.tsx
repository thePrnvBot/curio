import { Badge } from "@curio/ui/components/badge";
import { Skeleton } from "@curio/ui/components/skeleton";
import { Link } from "@tanstack/react-router";

import { SectionHeader, progressPercent } from "./section-shared";
import type { CourseSummaryView } from "./section-shared";

function CurrentCourseSkeleton() {
  return (
    <div className="bg-card rounded-xl border p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <Skeleton className="h-5 w-52" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
        <div className="bg-primary/50 h-full w-2/5 animate-pulse rounded-full" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-4">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

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
        <span className="shrink-0">
          {activeCourse.status === "active" ? "In progress" : "Paused"}
        </span>
      </div>
    </Link>
  );
}

export function CurrentCourseSection({
  activeCourse,
  empty,
  loading,
}: {
  activeCourse: CourseSummaryView | null;
  empty: React.ReactNode;
  loading: boolean;
}) {
  let content: React.ReactNode;
  if (loading) {
    content = <CurrentCourseSkeleton />;
  } else if (activeCourse === null) {
    content = empty;
  } else {
    content = <CurrentCourseCard activeCourse={activeCourse} />;
  }

  return (
    <section>
      <SectionHeader>Currently learning</SectionHeader>
      {content}
    </section>
  );
}
