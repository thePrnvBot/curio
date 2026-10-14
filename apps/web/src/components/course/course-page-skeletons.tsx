import { Skeleton } from "@curio/ui/components/skeleton";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";

export function LessonContentSkeleton(): ReactElement {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-10 w-3/4" />
      <div className="space-y-2 pt-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <Skeleton className="mt-6 aspect-video w-full rounded-xl" />
    </div>
  );
}

export function CoursePageSkeleton(): ReactElement {
  return (
    <div className="grid min-h-0 flex-1 md:grid-cols-[300px_1fr]">
      <div className="space-y-6 border-r px-5 py-6">
        <Skeleton className="h-4 w-24" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-1.5 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
      <div>
        <div className="mx-auto max-w-2xl px-6 py-10">
          <LessonContentSkeleton />
        </div>
      </div>
    </div>
  );
}

export function MissingCourseNotice(props: {
  description: string;
  title: string;
}): ReactElement {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">{props.title}</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {props.description}
        </p>
        <Link
          className="text-primary mt-4 inline-block text-sm font-medium underline"
          to="/courses"
        >
          Back to courses
        </Link>
      </div>
    </div>
  );
}

