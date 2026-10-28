import { Skeleton } from "@curio/ui/components/skeleton";
import type { ReactElement } from "react";

/**
 * Universal full-page skeleton shown while a route's async gate (e.g. the
 * authenticated layout's session check) resolves, for any page that has no
 * section-specific skeleton of its own.
 */
export function AppPageSkeleton(): ReactElement {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 pt-8 pb-20" aria-hidden="true">
      <div className="mb-8 flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <div className="bg-card/50 rounded-xl border p-6">
          <Skeleton className="h-4 w-28" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        </div>
        <div className="bg-card/50 rounded-xl border p-6">
          <Skeleton className="h-4 w-36" />
          <div className="mt-4 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </div>
    </div>
  );
}

const COURSES_SKELETON_CARDS = [0, 1, 2];
const COURSES_SKELETON_BADGES = [0, 1, 2, 3, 4, 5, 6, 7];

/** Layout-faithful skeleton for the Courses tab: same container, heading,
 * section headers and section compositions as the live page (progress card,
 * course card grid, badge medal row), so the real page swaps in without
 * any jump. */
export function CoursesPageSkeleton(): ReactElement {
  return (
    <div
      aria-hidden="true"
      className="mx-auto w-full max-w-5xl shrink-0 px-6 pt-8 pb-20"
    >
      <div className="mb-8">
        <Skeleton className="h-8 w-28" />
      </div>

      <div className="space-y-10">
        {/* Currently learning */}
        <div>
          <Skeleton className="mb-4 h-4 w-40" />
          <div className="rounded-xl border p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <Skeleton className="h-5 w-52" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
            <div className="mt-3 flex items-center justify-between gap-4">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        </div>

        {/* Your courses */}
        <div>
          <Skeleton className="mb-4 h-4 w-28" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {COURSES_SKELETON_CARDS.map((card) => (
              <div className="overflow-hidden rounded-xl border" key={card}>
                <div className="relative aspect-video w-full">
                  <Skeleton className="absolute inset-0 rounded-none" />
                  <div className="from-background via-background/70 absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent p-4 pt-12">
                    <Skeleton className="mb-2 h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="mt-3 h-5 w-14 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Badge showcase */}
        <div>
          <Skeleton className="mb-4 h-4 w-32" />
          <div className="bg-card/50 rounded-xl border p-5 md:p-6">
            <div className="flex flex-wrap gap-x-7 gap-y-5">
              {COURSES_SKELETON_BADGES.map((medal) => (
                <div
                  className="flex w-16 flex-col items-center gap-2"
                  key={medal}
                >
                  <Skeleton className="size-14 rounded-full" />
                  <Skeleton className="h-3 w-12" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
