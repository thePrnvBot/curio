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
import { Badge } from "@curio/ui/components/badge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LoaderIcon, Share2Icon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import type { ReactElement } from "react";
import { toast } from "sonner";

import { playInteractionCue } from "@/utils/sound";
import { useTRPC } from "@/utils/trpc";

import { CourseCardArt } from "./course-card-art";
import { progressPercent, SectionHeader } from "./section-shared";
import type { CourseSummaryView } from "./section-shared";

const cardActionButtonClass =
  "bg-background/90 text-muted-foreground hover:text-foreground hover:border-foreground/20 hover:bg-background rounded-md border p-1.5 shadow-xs backdrop-blur-sm transition-[color,border-color,background-color] duration-150";

/** Share + delete icon buttons, pinned to the card's bottom-right corner.
 * Sits outside the card link so the nested-element rules stay clean. */
export function CardActions({
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
      setIsSharing(true);
      try {
        await navigator.share({ title, url: shareUrl });
        setIsSharing(false);
        return;
      } catch (shareError: unknown) {
        setIsSharing(false);
        // A dismissed share sheet is not a fallback signal; only copy when
        // sharing genuinely failed.
        if (shareError instanceof Error && shareError.name === "AbortError") {
          return;
        }
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

  const deleteButtonClass = deleteCourse.isPending
    ? `${cardActionButtonClass} text-destructive`
    : `${cardActionButtonClass} hover:border-destructive/40 hover:text-destructive`;

  return (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
        <button
          aria-label={`Share ${title}`}
          className={cardActionButtonClass}
          disabled={isSharing || deleteCourse.isPending}
          onClick={() => {
            playInteractionCue("tap", { emphasis: "subtle" });
            void shareCourse();
          }}
          title="Share course"
          type="button"
        >
          <Share2Icon className="size-4" aria-hidden="true" />
        </button>
        <AlertDialogTrigger
          aria-label={`Delete ${title}`}
          className={deleteButtonClass}
          title="Delete course"
        >
          {deleteCourse.isPending ? (
            <LoaderIcon className="size-4 animate-spin" aria-hidden="true" />
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

function CourseCard({
  active,
  course,
}: {
  active: boolean;
  course: CourseSummaryView;
}) {
  const isActive = active;
  const percent = progressPercent(course);
  return (
    <div
      className="group surface-card hover:border-foreground/15 relative w-full overflow-hidden transition-[border-color] duration-200 ease-out"
      key={course.id}
    >
      <Link
        className="block focus-visible:outline-none"
        data-cue="navigate"
        params={{ courseId: course.id }}
        to="/courses/$courseId"
      >
        <div className="relative aspect-[4/3] w-full">
          <CourseCardArt active={isActive} />
          <div className="from-card via-card/85 to-card/0 absolute inset-x-0 bottom-0 bg-gradient-to-t px-4 pt-16 pb-4">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <span className="block truncate text-[13.5px] font-medium tracking-[-0.01em]">
                  {course.title}
                </span>
                <p className="text-muted-foreground mt-1 text-xs">
                  {`${course.completedLessonCount} of ${course.lessonCount} lessons`}
                </p>
              </div>
              {isActive ? <Badge variant="brand">In progress</Badge> : null}
            </div>
            <div className="mt-3.5 flex items-center gap-3">
              <div className="bg-muted h-1 min-w-0 flex-1 overflow-hidden rounded-full">
                <div
                  className="bg-brand h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{ width: `${Math.max(percent, 2)}%` }}
                />
              </div>
              <span className="text-muted-foreground w-8 shrink-0 text-right text-[11px] tabular-nums">
                {`${percent}%`}
              </span>
            </div>
          </div>
        </div>
      </Link>
      <CardActions courseId={course.id} title={course.title} />
    </div>
  );
}

export function CourseListSection({
  activeCourseId,
  courses,
  empty,
}: {
  activeCourseId: string | null;
  courses: readonly CourseSummaryView[];
  empty: React.ReactNode;
}) {
  return (
    <section>
      <SectionHeader>Your courses</SectionHeader>
      {courses.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard
              active={course.id === activeCourseId}
              course={course}
              key={course.id}
            />
          ))}
        </div>
      ) : (
        empty
      )}
    </section>
  );
}
