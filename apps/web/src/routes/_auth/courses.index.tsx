import { Badge } from "@curio/ui/components/badge";
import { Skeleton } from "@curio/ui/components/skeleton";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheckIcon, CompassIcon, SparklesIcon, TrophyIcon } from "lucide-react";

import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/courses/")({
  component: CoursesRoute,
});

const COURSE_CARD_SKELETONS = [0, 1, 2];
const BADGE_SKELETONS = [0, 1, 2, 3, 4, 5, 6, 7];
const EMPTY_BADGE_SLOTS = [0, 1, 2];

interface CourseSummaryView {
  readonly completedLessonCount: number;
  readonly id: string;
  readonly lessonCount: number;
  readonly status: string;
  readonly title: string;
}

interface CourseBadgeView {
  readonly id: string;
  readonly label: string;
}

function SectionHeader({ children, note }: { children: string; note?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="text-muted-foreground text-sm font-medium tracking-widest uppercase">
        {children}
      </h2>
      {note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
    </div>
  );
}

function progressPercent(course: CourseSummaryView): number {
  if (course.lessonCount === 0) {
    return 0;
  }
  const percent = Math.round(
    (course.completedLessonCount / course.lessonCount) * 100
  );
  return Math.min(percent, 100);
}

/** Featured card: the most recently touched active course. */
function CurrentCourseSection({
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
      <SectionHeader
        note={activeCourse === null && !loading ? "No active course yet" : undefined}
      >
        Currently learning
      </SectionHeader>
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

/** Course list grid with banner cards (title over a vignette video slot). */
function CourseListSection({
  courses,
  empty,
  loading,
}: {
  courses: readonly CourseSummaryView[];
  empty: React.ReactNode;
  loading: boolean;
}) {
  return (
    <section>
      <SectionHeader
        note={
          courses.length === 0 && !loading
            ? undefined
            : "New lessons appear here as the Director builds them."
        }
      >
        Your courses
      </SectionHeader>
      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2">
          {COURSE_CARD_SKELETONS.map((index) => (
            <div
              key={index}
              className="bg-card overflow-hidden rounded-xl border"
            >
              <div className="relative aspect-video w-full overflow-hidden">
                <Skeleton className="absolute inset-0 rounded-none" />
                <div className="from-background via-background/70 absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent p-4 pt-12">
                  <Skeleton className="mb-2 h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <div className="mt-3 flex items-center gap-2">
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : courses.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course, courseIndex) => {
            const isActive = course.status === "active" && courseIndex === 0;
            return (
              <Link
                className="hover:border-ring block w-full overflow-hidden rounded-xl border"
                key={course.id}
                params={{ courseId: course.id }}
                to="/courses/$courseId"
              >
                <div className="bg-muted/50 relative aspect-video w-full">
                  <span className="text-muted-foreground/40 absolute inset-0 flex items-center justify-center text-xs tracking-widest uppercase">
                    Video slot
                  </span>
                  <div className="from-background via-background/70 absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent p-4 pt-12">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">
                        {course.title}
                      </span>
                      {isActive ? <Badge>In progress</Badge> : null}
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {`${course.completedLessonCount} of ${course.lessonCount} lessons · ${progressPercent(course)}%`}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <Badge variant="outline">{`${course.lessonCount} lessons`}</Badge>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        empty
      )}
    </section>
  );
}

/** Earned medal row, or an invite to earn the first one. */
function BadgeShowcaseSection({
  badges,
  empty,
  loading,
}: {
  badges: readonly CourseBadgeView[];
  empty: React.ReactNode;
  loading: boolean;
}) {
  return (
    <section>
      <SectionHeader
        note={
          badges.length === 0 && !loading
            ? undefined
            : "Share earned badges to your profile or social media."
        }
      >
        Badge showcase
      </SectionHeader>
      {loading ? (
        <div className="flex flex-wrap gap-x-7 gap-y-5">
          {BADGE_SKELETONS.map((index) => (
            <div
              key={index}
              className="flex w-16 flex-col items-center gap-2"
              aria-hidden="true"
            >
              <Skeleton className="size-14 rounded-full" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      ) : badges.length > 0 ? (
        <div className="flex flex-wrap gap-x-7 gap-y-5">
          {badges.map((badge) => (
            <div
              className="flex w-16 flex-col items-center gap-2 text-center"
              key={badge.id}
            >
              <span className="ring-primary/20 bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full ring-4">
                <TrophyIcon className="size-5" aria-hidden="true" />
              </span>
              <span className="text-foreground text-xs leading-tight font-medium">
                {badge.label}
              </span>
            </div>
          ))}
        </div>
      ) : (
        empty
      )}
    </section>
  );
}

/**
 * Courses tab. Data comes from the Director: chat-driven course creation
 * populates the list; the badge showcase fills as courses complete. Each
 * section carries its own loading skeleton and empty view.
 */
function CoursesRoute() {
  const trpc = useTRPC();
  const coursesQuery = useQuery(trpc.courses.list.queryOptions());
  const badgesQuery = useQuery(trpc.courses.listBadges.queryOptions());

  const coursesLoading = coursesQuery.isPending;
  const badgesLoading = badgesQuery.isPending;

  const courses: CourseSummaryView[] = coursesQuery.data ?? [];
  const badges: CourseBadgeView[] = (badgesQuery.data ?? []).map((badge) => {
    return { id: badge.id, label: badge.label };
  });

  // The server orders by most recently updated first; the first active
  // course is the one being learned right now.
  const activeCourse =
    courses.find((course) => course.status === "active") ?? null;

  return (
    <div className="mx-auto w-full max-w-5xl shrink-0 px-6 pt-8 pb-20">
      <div className="mb-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Courses</h1>
          <p className="text-muted-foreground mt-1 max-w-xl text-sm text-balance">
            Courses take shape while you chat with the Director - lessons,
            animations and recap exercises land here as you learn.
          </p>
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

function EmptyActiveCourseCard() {
  return (
    <div className="bg-card/50 flex flex-wrap items-center gap-4 rounded-xl border p-5 md:p-6">
      <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
        <CompassIcon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">No course in progress</p>
        <p className="text-muted-foreground text-sm">
          Tell the Director what you want to learn and it will build one here.
        </p>
      </div>
      <Link
        className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-2 text-sm font-medium"
        to="/chat"
      >
        Open the Director
      </Link>
    </div>
  );
}

function EmptyCourseGrid() {
  return (
    <div className="bg-card/50 flex flex-wrap items-center gap-4 rounded-xl border p-5 md:p-6">
      <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
        <BookOpenCheckIcon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">No courses yet</p>
        <p className="text-muted-foreground text-sm">
          Courses you start with the Director appear here with videos, cards,
          animations and recap exercises.
        </p>
      </div>
      <Link
        className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-2 text-sm font-medium"
        to="/chat"
      >
        Create a course
      </Link>
    </div>
  );
}

function EmptyBadgeShowcase() {
  return (
    <div className="bg-card/50 rounded-xl border p-5 md:p-6">
      <div className="flex flex-wrap items-center gap-4">
        <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
          <SparklesIcon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">No badges yet</p>
          <p className="text-muted-foreground text-sm">
            Earn your first badge by completing lessons from a course.
          </p>
        </div>
      </div>
      <div className="border-border/70 mt-4 flex items-center gap-3 border-t pt-4" aria-hidden="true">
        {EMPTY_BADGE_SLOTS.map((slot) => (
          <span
            className="text-muted-foreground/60 flex size-12 items-center justify-center rounded-full border border-dashed"
            key={slot}
          >
            <TrophyIcon className="size-4" />
          </span>
        ))}
      </div>
    </div>
  );
}
