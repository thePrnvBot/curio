import { Badge } from "@curio/ui/components/badge";
import { Skeleton } from "@curio/ui/components/skeleton";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { playInteractionCue } from "@/utils/sound";
import {
  BookOpenCheckIcon,
  CompassIcon,
  LoaderIcon,
  PencilIcon,
  Share2Icon,
  SparklesIcon,
  Trash2Icon,
  TrophyIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useState, type ReactElement } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@curio/ui/components/alert-dialog";

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
      <SectionHeader>Your courses</SectionHeader>
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
              <div
                className="group relative w-full overflow-hidden rounded-xl border"
                key={course.id}
              >
                <Link
                  className="hover:border-ring block"
                  params={{ courseId: course.id }}
                  to="/courses/$courseId"
                >
                  <div className="bg-muted/50 relative aspect-video w-full">
                    <span className="text-muted-foreground/40 absolute inset-0 flex items-center justify-center text-xs tracking-widest uppercase">
                      Video slot
                    </span>
                    <div className="from-background via-background/70 absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent p-4 pt-12">
                      <div className="flex items-center justify-between gap-2 pr-20">
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
                <CardActions courseId={course.id} title={course.title} />
              </div>
            );
          })}
        </div>
      ) : (
        empty
      )}
    </section>
  );
}

const cardActionButtonClass =
  "bg-background/85 text-muted-foreground hover:text-foreground hover:bg-background rounded-lg border p-2 shadow-xs transition-colors";

/** Share + delete icon buttons, pinned to the card's bottom-right corner.
 * Sits outside the card link so the nested-element rules stay clean. */
function CardActions({
  courseId,
  title,
}: {
  courseId: string;
  title: string;
}): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [isSharing, setIsSharing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const deleteCourse = useMutation(trpc.courses.delete.mutationOptions());

  async function shareCourse(): Promise<void> {
    const shareUrl = `${window.location.origin}/courses/${courseId}`;
    // Native share sheet where available (mobile); clipboard otherwise.
    if (typeof navigator.share === "function") {
      try {
        setIsSharing(true);
        await navigator.share({ title, url: shareUrl });
        return;
      } catch {
        // User dismissed the sheet - fall through to copying the link.
      } finally {
        setIsSharing(false);
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      playInteractionCue("success", { emphasis: "subtle" });
      toast.success("Course link copied");
    } catch {
      toast.error("Could not copy the course link");
    }
  }

  function confirmDelete(): void {
    deleteCourse.mutate(
      { courseId },
      {
        onError: (mutationError) => {
          toast.error(mutationError.message);
        },
        onSuccess: () => {
          setConfirmOpen(false);
          void queryClient.invalidateQueries({
            queryKey: trpc.courses.pathKey(),
          });
          toast.success(`Course "${title}" deleted`);
          playInteractionCue("close", { emphasis: "strong" });
        },
      }
    );
  }

  return (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <div className="absolute right-3 bottom-3 z-10 flex items-center gap-1.5">
        <button
          aria-label={`Share ${title}`}
          className={cardActionButtonClass}
          disabled={isSharing || deleteCourse.isPending}
          onClick={() => {
            void shareCourse();
          }}
          title="Share course"
          type="button"
        >
          <Share2Icon className="size-4" aria-hidden="true" />
        </button>
        <AlertDialogTrigger
          aria-label={`Delete ${title}`}
          className={
            deleteCourse.isPending
              ? `${cardActionButtonClass} text-destructive`
              : `${cardActionButtonClass} hover:border-destructive/40 hover:text-destructive`
          }
          title="Delete course"
        >
          {deleteCourse.isPending ? (
            <LoaderIcon className="animate-spin size-4" aria-hidden="true" />
          ) : (
            <Trash2Icon className="size-4" aria-hidden="true" />
          )}
        </AlertDialogTrigger>
      </div>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Delete "${title}"?`}</AlertDialogTitle>
          <AlertDialogDescription>
            The course and its lessons - including progress - are removed
            permanently. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={deleteCourse.isPending}
            onClick={() => {
              setConfirmOpen(false);
            }}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={deleteCourse.isPending}
            onClick={() => {
              confirmDelete();
            }}
          >
            {deleteCourse.isPending ? "Deleting..." : "Delete course"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Earned medal row, or an invite to earn the first one. The pencil at the
 * header's right end toggles an edit mode that lets each badge be removed. */
function BadgeShowcaseSection({
  badges,
  empty,
  loading,
}: {
  badges: readonly CourseBadgeView[];
  empty: React.ReactNode;
  loading: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const deleteBadge = useMutation(trpc.courses.deleteBadge.mutationOptions());

  function removeBadge(badgeId: string, badgeLabel: string): void {
    deleteBadge.mutate(
      { badgeId },
      {
        onError: (mutationError) => {
          toast.error(mutationError.message);
        },
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: trpc.courses.pathKey(),
          });
          playInteractionCue("close", { emphasis: "strong" });
          toast.success(`Badge "${badgeLabel}" removed`);
          // Nothing left to edit: drop out of edit mode.
          if (badges.length <= 1) {
            setIsEditing(false);
          }
        },
      }
    );
  }

  const canEdit = !loading && badges.length > 0;

  return (
    <section>
      <div className="flex items-end justify-between gap-3">
        <SectionHeader>Badge showcase</SectionHeader>
        {canEdit ? (
          <button
            aria-pressed={isEditing}
            className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors"
            onClick={() => {
              playInteractionCue("toggle");
              setIsEditing((currentlyEditing) => !currentlyEditing);
            }}
            type="button"
          >
            <PencilIcon aria-hidden="true" className="size-3.5" />
            {isEditing ? "Done" : "Edit"}
          </button>
        ) : null}
      </div>
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
              className="relative flex w-16 flex-col items-center gap-2 text-center"
              key={badge.id}
            >
              <span className="ring-primary/20 bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full ring-4">
                <TrophyIcon className="size-5" aria-hidden="true" />
              </span>
              <span className="text-foreground text-xs leading-tight font-medium">
                {badge.label}
              </span>
              {isEditing ? (
                <button
                  aria-label={`Delete badge ${badge.label}`}
                  className={deleteBadge.isPending
                    ? "bg-background border-destructive/50 text-destructive absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border shadow-xs"
                    : "bg-background hover:bg-destructive hover:text-destructive-foreground hover:border-destructive absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border shadow-xs transition-colors"}
                  disabled={deleteBadge.isPending}
                  onClick={() => {
                    removeBadge(badge.id, badge.label);
                  }}
                  title={`Delete badge ${badge.label}`}
                  type="button"
                >
                  <XIcon aria-hidden="true" className="size-3" />
                </button>
              ) : null}
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
