import { Link } from "@tanstack/react-router";
import {
  BookOpenCheckIcon,
  CompassIcon,
  SparklesIcon,
  TrophyIcon,
} from "lucide-react";

const EMPTY_BADGE_SLOTS = [0, 1, 2];



export function EmptyActiveCourseCard() {
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

export function EmptyCourseGrid() {
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

export function EmptyBadgeShowcase() {
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
