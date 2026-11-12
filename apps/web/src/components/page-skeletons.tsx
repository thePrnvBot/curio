import { Skeleton } from "@curio/ui/components/skeleton";
import type { ReactElement } from "react";

import { PageContainer } from "@/components/page-layout";

/**
 * Universal full-page skeleton shown while a route's async gate (e.g. the
 * authenticated layout's session check) resolves, for any page that has no
 * section-specific skeleton of its own.
 */
export function AppPageSkeleton(): ReactElement {
  return (
    <PageContainer width="narrow" aria-hidden="true">
      <div className="mb-10 flex items-start justify-between gap-3">
        <div className="space-y-3">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="size-8 rounded-full" />
      </div>
      <div className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <div className="surface-card p-6">
          <Skeleton className="h-4 w-28" />
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        </div>
        <div className="surface-card p-6">
          <Skeleton className="h-4 w-36" />
          <div className="mt-5 space-y-2.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </div>
    </PageContainer>
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
    <div className="-mt-14 min-h-0 flex-1 overflow-y-auto overscroll-none">
      <PageContainer aria-hidden="true" className="pt-20">
        <div className="mb-10 space-y-3">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>

        <div className="space-y-10">
          {/* Currently learning */}
          <div>
            <Skeleton className="mb-4 h-3 w-40" />
            <div className="surface-card overflow-hidden">
              <div className="relative aspect-[4/3] max-h-[320px] min-h-[240px] w-full sm:aspect-[21/7]">
                <Skeleton className="absolute inset-0 rounded-none" />
                <div className="from-card via-card/85 to-card/0 absolute inset-x-0 bottom-0 bg-gradient-to-t px-5 pt-24 pb-5 md:px-6">
                  <div className="flex items-end justify-between gap-4">
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-40" />
                      <Skeleton className="h-5 w-56" />
                    </div>
                    <Skeleton className="h-5 w-12 rounded-full" />
                  </div>
                  <Skeleton className="mt-4 h-1.5 w-full rounded-full" />
                  <div className="mt-2.5 flex items-center justify-between gap-4">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Your courses */}
          <div>
            <Skeleton className="mb-4 h-3 w-28" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {COURSES_SKELETON_CARDS.map((card) => (
                <div className="surface-card overflow-hidden" key={card}>
                  <div className="relative aspect-[4/3] w-full">
                    <Skeleton className="absolute inset-0 rounded-none" />
                    <div className="from-card via-card/85 to-card/0 absolute inset-x-0 bottom-0 bg-gradient-to-t px-4 pt-16 pb-4">
                      <div className="flex items-end justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-2">
                          <Skeleton className="h-4 w-4/5" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </div>
                      <Skeleton className="mt-3.5 h-1 w-full rounded-full" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Badge showcase */}
          <div>
            <Skeleton className="mb-4 h-3 w-32" />
            <div className="surface-card p-5">
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
      </PageContainer>
    </div>
  );
}
