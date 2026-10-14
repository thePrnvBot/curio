import { Badge } from "@curio/ui/components/badge";
import { Skeleton } from "@curio/ui/components/skeleton";
import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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
import { LoaderIcon, Share2Icon, Trash2Icon } from "lucide-react";
import { useState, type ReactElement } from "react";
import { toast } from "sonner";

import { playInteractionCue } from "@/utils/sound";
import { useTRPC } from "@/utils/trpc";
import {
  CourseSummaryView,
  progressPercent,
  SectionHeader,
} from "./section-shared";
const COURSE_CARD_SKELETONS = [0, 1, 2];



export function CourseListSection({
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
                        {`${course.completedLessonCount} of ${course.lessonCount} lessons Â· ${progressPercent(course)}%`}
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
