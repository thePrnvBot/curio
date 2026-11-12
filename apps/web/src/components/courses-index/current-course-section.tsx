import { Badge } from "@curio/ui/components/badge";
import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon } from "lucide-react";

import { ProgressFromZero } from "@/components/animated-progress";

import { CourseCardArt } from "./course-card-art";
import { SectionHeader, progressPercent } from "./section-shared";
import type { CourseSummaryView } from "./section-shared";

function CurrentCourseCard({
  activeCourse,
}: {
  activeCourse: CourseSummaryView;
}) {
  const percent = progressPercent(activeCourse);
  return (
    <Link
      className="surface-card group hover:border-foreground/15 relative block overflow-hidden transition-[border-color] duration-200 ease-out"
      data-cue="navigate"
      params={{ courseId: activeCourse.id }}
      to="/courses/$courseId"
    >
      <div className="relative aspect-[4/3] max-h-[320px] min-h-[240px] w-full sm:aspect-[21/7]">
        <CourseCardArt active />
        <div className="from-card via-card/85 to-card/0 absolute inset-x-0 bottom-0 bg-gradient-to-t px-5 pt-24 pb-5 md:px-6">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="section-label mb-1.5">
                Continue where you left off
              </p>
              <span className="block truncate text-[16px] font-medium tracking-[-0.015em]">
                {activeCourse.title}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="brand">{`${percent}%`}</Badge>
              <ArrowUpRightIcon
                aria-hidden="true"
                className="text-muted-foreground group-hover:text-foreground size-4 transition-colors"
              />
            </div>
          </div>
          <ProgressFromZero
            className="bg-muted mt-4 h-1.5 w-full"
            label={`Course progress: ${percent}%`}
            percent={percent}
          />
          <div className="text-muted-foreground mt-2.5 flex items-center justify-between gap-4 text-xs">
            <span className="truncate">
              {`${activeCourse.completedLessonCount} of ${activeCourse.lessonCount} lessons complete`}
            </span>
            <span className="shrink-0">In progress</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function CurrentCourseSection({
  activeCourse,
  empty,
}: {
  activeCourse: CourseSummaryView | null;
  empty: React.ReactNode;
}) {
  return (
    <section>
      <SectionHeader>Currently learning</SectionHeader>
      {activeCourse === null ? (
        empty
      ) : (
        <CurrentCourseCard activeCourse={activeCourse} />
      )}
    </section>
  );
}
