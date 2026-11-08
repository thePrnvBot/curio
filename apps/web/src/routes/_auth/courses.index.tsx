import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { BadgeShowcaseSection } from "@/components/courses-index/badge-showcase";
import {
  EmptyActiveCourseCard,
  EmptyBadgeShowcase,
  EmptyCourseGrid,
} from "@/components/courses-index/course-empty-views";
import { CourseListSection } from "@/components/courses-index/course-list";
import { CurrentCourseSection } from "@/components/courses-index/current-course-section";
import type {
  CourseBadgeView,
  CourseSummaryView,
} from "@/components/courses-index/section-shared";
import { CoursesPageSkeleton } from "@/components/page-skeletons";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/courses/")({
  component: CoursesRoute,
  pendingComponent: CoursesPageSkeleton,
});

/**
 * Courses tab. Data comes from the Director: chat-driven course creation
 * populates the list; the badge showcase fills as courses complete. While
 * the course or badge queries are pending, the whole page renders as one
 * layout-faithful skeleton instead of per-section placeholders.
 */
function CoursesRoute() {
  const trpc = useTRPC();
  const coursesQuery = useQuery(trpc.courses.list.queryOptions());
  const badgesQuery = useQuery(trpc.courses.listBadges.queryOptions());

  const coursesLoading = coursesQuery.isPending;
  const badgesLoading = badgesQuery.isPending;

  if (coursesLoading || badgesLoading) {
    return <CoursesPageSkeleton />;
  }

  if (coursesQuery.isError || badgesQuery.isError) {
    const failure = coursesQuery.error ?? badgesQuery.error;
    return (
      <div className="mx-auto w-full max-w-5xl shrink-0 px-6 pt-8 pb-20">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Courses</h1>
        </header>
        <div className="border-border bg-card flex flex-col items-start gap-3 rounded-xl border p-6">
          <p className="text-sm font-medium">Could not load your courses</p>
          <p className="text-muted-foreground text-xs">
            {failure?.message ?? "The server did not answer. Try again."}
          </p>
          <button
            className="border-border hover:bg-accent focus-visible:ring-ring rounded-md border px-3 py-1.5 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none"
            onClick={() => {
              void coursesQuery.refetch();
              void badgesQuery.refetch();
            }}
            type="button"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const courses: CourseSummaryView[] = coursesQuery.data ?? [];
  const badges: CourseBadgeView[] = (badgesQuery.data ?? []).map((badge) => ({
    id: badge.id,
    label: badge.label,
  }));

  // The server orders by most recently updated first; the first active
  // course is the one being learned right now.
  const activeCourse =
    courses.find((course) => course.status === "active") ?? null;

  return (
    <div className="min-h-0 flex-1 [scrollbar-width:none] overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden">
      <div className="mx-auto w-full max-w-5xl px-6 pt-8 pb-20">
        <div className="mb-8">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight">Courses</h1>
          </header>
        </div>

        <div className="space-y-10">
          <CurrentCourseSection
            activeCourse={activeCourse}
            empty={<EmptyActiveCourseCard />}
          />
          <CourseListSection
            activeCourseId={activeCourse?.id ?? null}
            courses={courses}
            empty={<EmptyCourseGrid />}
          />
          <BadgeShowcaseSection
            badges={badges}
            empty={<EmptyBadgeShowcase />}
          />
        </div>
      </div>
    </div>
  );
}
