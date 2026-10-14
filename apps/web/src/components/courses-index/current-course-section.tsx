import { Badge } from "@curio/ui/components/badge";
import { Skeleton } from "@curio/ui/components/skeleton";

import { CourseSummaryView, SectionHeader, progressPercent } from "./section-shared";



export function CurrentCourseSection({
  activeCourse,
  empty,
  loading,
}: {
  activeCourse: CourseSummaryView | null;
  empty: React.ReactNode;
  loading: boolean;
}) {
  return (
    <section>
      <SectionHeader>Currently learning</SectionHeader>
      {loading ? (
        <div className="bg-card rounded-xl border p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <Skeleton className="h-5 w-52" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
            <div className="animate-pulse h-full w-2/5 rounded-full bg-primary/50" />
          </div>
          <div className="mt-3 flex items-center justify-between gap-4">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ) : activeCourse !== null ? (
        <div className="bg-card rounded-xl border p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <span className="truncate font-medium">{activeCourse.title}</span>
            <Badge>{`${progressPercent(activeCourse)}%`}</Badge>
          </div>
          <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-[width] duration-500"
              style={{ width: `${Math.max(progressPercent(activeCourse), 2)}%` }}
            />
          </div>
          <div className="text-muted-foreground mt-3 flex items-center justify-between gap-4 text-xs">
            <span
              className="truncate"
            >
              {`Completed ${activeCourse.completedLessonCount} of ${activeCourse.lessonCount} lessons`}
            </span>
            <span className="shrink-0">
              {activeCourse.status === "active" ? "In progress" : "Paused"}
            </span>
          </div>
        </div>
      ) : (
        empty
      )}
    </section>
  );
}
