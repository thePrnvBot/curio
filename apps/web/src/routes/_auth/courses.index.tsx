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
import { PageContainer, PageHeader } from "@/components/page-layout";
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
      <div className="-mt-14 min-h-0 flex-1 overflow-y-auto overscroll-none">
        <PageContainer className="pt-20">
          <PageHeader
            description="Courses the Director built for you, with progress that picks up where you left off."
            title="Courses"
          />
          <div className="surface-card flex flex-col items-start gap-3 p-6">
            <p className="text-[13.5px] font-medium">
              Could not load your courses
            </p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              {failure?.message ?? "The server did not answer. Try again."}
            </p>
            <button
              className="border-border hover:bg-muted focus-visible:ring-ring rounded-md border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
              onClick={() => {
                void coursesQuery.refetch();
                void badgesQuery.refetch();
              }}
              type="button"
            >
              Retry
            </button>
          </div>
        </PageContainer>
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
    <div className="-mt-14 min-h-0 flex-1 overflow-y-auto overscroll-none">
      <PageContainer className="pt-20">
        <PageHeader
          description="Courses the Director built for you, with progress that picks up where you left off."
          title="Courses"
        />

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
      </PageContainer>
    </div>
  );
}
