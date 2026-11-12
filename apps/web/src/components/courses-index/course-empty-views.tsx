import { Button } from "@curio/ui/components/button";
import { Link } from "@tanstack/react-router";
import {
  BookOpenCheckIcon,
  CompassIcon,
  SparklesIcon,
  TrophyIcon,
} from "lucide-react";

const EMPTY_BADGE_SLOTS = [0, 1, 2];

function EmptyStateCard({
  action,
  description,
  icon,
  title,
}: {
  action: React.ReactNode;
  description: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="surface-card flex flex-wrap items-center gap-4 p-5">
      <span className="bg-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium">{title}</p>
        <p className="text-muted-foreground mt-1 max-w-lg text-[13px] leading-6">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

export function EmptyActiveCourseCard() {
  return (
    <EmptyStateCard
      action={
        <Button render={<Link to="/chat" />} size="sm">
          Open the Director
        </Button>
      }
      description="Tell the Director what you want to learn and it will build a course here."
      icon={<CompassIcon className="size-4" aria-hidden="true" />}
      title="No course in progress"
    />
  );
}

export function EmptyCourseGrid() {
  return (
    <EmptyStateCard
      action={
        <Button render={<Link to="/chat" />} size="sm">
          Create a course
        </Button>
      }
      description="Courses you start with the Director appear here with videos, cards, animations and recap exercises."
      icon={<BookOpenCheckIcon className="size-4" aria-hidden="true" />}
      title="No courses yet"
    />
  );
}

export function EmptyBadgeShowcase() {
  return (
    <div className="surface-card p-5">
      <div className="flex flex-wrap items-center gap-4">
        <span className="bg-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
          <SparklesIcon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium">No badges yet</p>
          <p className="text-muted-foreground mt-1 max-w-lg text-[13px] leading-6">
            Earn your first badge by completing lessons from a course.
          </p>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="border-border/70 mt-5 flex items-center gap-3 border-t pt-5"
      >
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
