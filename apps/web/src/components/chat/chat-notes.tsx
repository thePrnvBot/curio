import { Skeleton } from "@curio/ui/components/skeleton";
import { BookOpenCheckIcon } from "lucide-react";

export function CourseCreatedNote({
  courseData,
}: {
  courseData: {
    readonly lessonCount: number;
    readonly title: string;
  };
}) {
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
          {courseData.lessonCount} lessons added -
          <a
            className="text-primary ml-1 font-medium underline underline-offset-2"
            href="/courses"
          >
            open the Courses tab
          </a>
        </p>
      </div>
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="flex size-full flex-col overflow-hidden">
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
  );
}

/** Skeleton view shown while the restored conversation loads. */
