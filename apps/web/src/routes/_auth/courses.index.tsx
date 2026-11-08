import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import {
  BadgeShowcaseSection,
} from "@/components/courses-index/badge-showcase";
import {
  EmptyActiveCourseCard,
  EmptyBadgeShowcase,
  EmptyCourseGrid,
} from "@/components/courses-index/course-empty-views";
import {
  CourseListSection,
} from "@/components/courses-index/course-list";
import {
  CurrentCourseSection,
} from "@/components/courses-index/current-course-section";
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
    <div className="mx-auto w-full max-w-5xl shrink-0 px-6 pt-8 pb-20">
      <div className="mb-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Courses</h1>
        </header>
      </div>

      <div className="space-y-10">
        <CurrentCourseSection
          activeCourse={activeCourse}
          empty={
            <EmptyActiveCourseCard />
          }
          loading={coursesLoading}
        />
        <CourseListSection
          courses={courses}
          empty={<EmptyCourseGrid />}
          loading={coursesLoading}
        />
        <BadgeShowcaseSection
          badges={badges}
          empty={<EmptyBadgeShowcase />}
          loading={badgesLoading}
        />
      </div>
    </div>
  );
}
