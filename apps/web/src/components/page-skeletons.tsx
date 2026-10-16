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
