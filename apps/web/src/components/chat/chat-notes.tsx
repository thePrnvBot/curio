import { Skeleton } from "@curio/ui/components/skeleton";
import { Link } from "@tanstack/react-router";
import { BookOpenCheckIcon } from "lucide-react";
import type { ReactElement } from "react";

/** Course-created banner shown under the Director's scaffold tool call. */
export function CourseCreatedNote({
  courseData,
}: {
  courseData: {
    readonly lessonCount: number;
    readonly title: string;
  };
}): ReactElement {
  return (
    <div className="bg-card flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
        <BookOpenCheckIcon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          Course ready: {courseData.title}
        </p>
        <p className="text-muted-foreground text-xs">
          {courseData.lessonCount} lessons streaming in -
          <Link
            className="text-primary ml-1 font-medium underline underline-offset-2"
            to="/courses"
          >
            open the Courses tab
          </Link>
        </p>
      </div>
    </div>
  );
}

/** Tiny streamed-progress row shown as the Director fills lessons one
 * `create_lesson` call at a time. */
export function LessonChunkNote({
  position,
  title,
}: {
  position: number;
  title: string;
}): ReactElement {
  return (
    <div className="bg-primary/[0.04] flex items-center gap-2.5 rounded-lg border border-dashed px-3 py-1.5">
      <span className="bg-primary/10 text-primary flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">
        {position}
      </span>
      <p className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
        Lesson filled: <span className="text-foreground">{title}</span>
      </p>
      <span
        aria-hidden="true"
        className="text-primary shrink-0 text-[10px] font-semibold"
      >
        ✓
      </span>
    </div>
  );
}

/** Skeleton view shown as the pending route component — laid out like the
 * real Director page (conversation column, session files rail) so nothing
 * jumps when the actual UI replaces it. The chat list rail is not mimicked
 * here: it is rendered once by the parent chat layout that wraps this
 * skeleton, so drawing it again would duplicate the sidebar. */
export function ChatSkeleton() {
  return (
    <div className="flex size-full">
      {/* Conversation column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 overflow-hidden px-4 py-6">
          <div className="flex justify-start">
            <Skeleton className="h-14 w-2/3 rounded-2xl" />
          </div>
          <div className="flex justify-end">
            <Skeleton className="h-10 w-1/2 rounded-2xl" />
          </div>
          <div className="flex justify-start">
            <Skeleton className="h-24 w-3/4 rounded-2xl" />
          </div>
          <div className="flex justify-end">
            <Skeleton className="h-8 w-1/3 rounded-2xl" />
          </div>
        </div>
        <div className="mx-auto w-full max-w-3xl px-4 pb-4">
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      </div>

      {/* Session files rail (matches the lg-only real rail) */}
      <aside className="bg-sidebar hidden h-full w-64 shrink-0 flex-col border-l lg:flex">
        <div className="px-3 pt-3 pb-2">
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="flex items-center justify-center gap-1 px-2 pb-2">
          {[0, 1, 2, 3, 4, 5].map((filterChip) => (
            <Skeleton className="size-7 border" key={`filter-${filterChip}`} />
          ))}
        </div>
        <div className="flex-1 space-y-4 overflow-hidden px-3">
          <div className="space-y-2">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      </aside>
    </div>
  );
}
