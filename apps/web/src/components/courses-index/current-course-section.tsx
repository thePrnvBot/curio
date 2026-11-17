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
      className="surface-card group hover:border-foreground/15 grid overflow-hidden transition-[border-color] duration-200 ease-out sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]"
      data-cue="navigate"
      params={{ courseId: activeCourse.id }}
      to="/courses/$courseId"
    >
      <div className="border-border/70 relative aspect-[16/9] w-full border-b sm:aspect-auto sm:min-h-44 sm:border-r sm:border-b-0">
        <CourseCardArt active />
      </div>

      <div className="flex flex-col justify-between gap-8 p-5">
        <div>
          <div className="flex items-start justify-between gap-4">
            <p className="section-label">Continue where you left off</p>
            <ArrowUpRightIcon
              aria-hidden="true"
              className="text-muted-foreground group-hover:text-foreground size-4 transition-colors"
            />
          </div>
          <span className="mt-2.5 block truncate text-[17px] font-medium tracking-[-0.02em]">
            {activeCourse.title}
          </span>
          <p className="text-muted-foreground mt-1 text-xs">
            {`${activeCourse.completedLessonCount} of ${activeCourse.lessonCount} lessons complete`}
          </p>
        </div>

        <div>
          <div className="text-muted-foreground flex items-baseline justify-between gap-4 text-xs">
            <span>In progress</span>
            <span className="text-foreground font-mono tabular-nums">
              {`${percent}%`}
            </span>
          </div>
          <ProgressFromZero
            className="bg-muted mt-2 h-1 w-full"
            label={`Course progress: ${percent}%`}
            percent={percent}
          />
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
