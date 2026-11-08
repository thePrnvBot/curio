import type { CourseLessonKind, LessonContent } from "@curio/api/domain/course";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, CheckIcon, LoaderCircleIcon } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { ProgressFromZero } from "@/components/animated-progress";
import {
  CoursePageSkeleton,
  LessonContentSkeleton,
  MissingCourseNotice,
} from "@/components/course/course-page-skeletons";
import { GuidedExplanationPlayer } from "@/components/course/guided-explanation-player";
import { LessonCompletionControls } from "@/components/course/lesson-completion-controls";
import { LessonContentView } from "@/components/course/lesson-content-views";
import { playInteractionCue } from "@/utils/sound";
import { useTRPC } from "@/utils/trpc";

// `lesson` is kept only when it's a non-empty string; anything else (missing,
// empty, or a non-string value) falls back to undefined so the route picks the
// initial lesson itself.
const courseSearchSchema = z.object({
  lesson: z.preprocess(
    (value) =>
      typeof value === "string" && value.length > 0 ? value : undefined,
    z.string().min(1).optional()
  ),
});

export const Route = createFileRoute("/_auth/courses/$courseId")({
  component: CoursePageRoute,
  // Skeleton over the orb while the course structure resolves on navigation
  pendingComponent: () => <CoursePageSkeleton />,
  validateSearch: courseSearchSchema,
});

interface LessonLike {
  readonly id: string;
  readonly kind: CourseLessonKind;
  readonly title: string;
  readonly position: number;
  readonly completed: boolean;
  readonly hasContent: boolean;
}

interface CourseSidebarSection {
  readonly id?: string | null;
  readonly lessons: readonly LessonLike[];
  readonly title: string;
}

const LESSON_KIND_LABELS: Record<CourseLessonKind, string> = {
  video: "Video",
  cards: "Cards",
  animation: "Animation",
  recap: "Recap",
  "guided-explanation": "Guided explanation",
};

const EMPTY_SECTIONS: readonly CourseSidebarSection[] = [];

/** The server now carries the typed lesson-kind union, so no runtime re-parse
 * is needed; unknown legacy values are normalized in the API layer. */
function lessonKindLabel(kind: CourseLessonKind): string {
  return LESSON_KIND_LABELS[kind];
}

/** The single lesson the reader currently has open: first incomplete lesson,
 * falling back to the last lesson of the course. */
function pickInitialLesson(
  sections: readonly { lessons: readonly LessonLike[] }[]
): string | null {
  const allLessons = sections.flatMap((section) => section.lessons);
  const firstIncomplete = allLessons.find((lesson) => !lesson.completed);
  return firstIncomplete?.id ?? allLessons.at(-1)?.id ?? null;
}

function LessonListButton({
  flatLessons,
  goToLesson,
  lesson,
  selectedLessonId,
}: {
  flatLessons: readonly LessonLike[];
  goToLesson: (lessonId: string | null) => void;
  lesson: LessonLike;
  selectedLessonId: string | null;
}) {
  const isActive = lesson.id === selectedLessonId;
  return (
    <button
      className={
        isActive
          ? "bg-accent text-foreground hover:bg-accent focus-visible:ring-ring w-full rounded-md px-2 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:outline-none"
          : "hover:bg-accent text-muted-foreground hover:text-foreground focus-visible:ring-ring w-full rounded-md px-2 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:outline-none"
      }
      onClick={() => {
        // Direction-aware cue: going up the course reads "back", going
        // down reads "forward".
        const nextIndex = flatLessons.findIndex(
          (flatLesson) => flatLesson.id === lesson.id
        );
        const currentIndex =
          selectedLessonId === null
            ? -1
            : flatLessons.findIndex(
                (flatLesson) => flatLesson.id === selectedLessonId
              );
        playInteractionCue("select", {
          direction: currentIndex > nextIndex ? "back" : "forward",
          emphasis: "subtle",
        });
        goToLesson(lesson.id);
      }}
      type="button"
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={
            lesson.completed
              ? "bg-primary/15 text-primary flex size-4 shrink-0 items-center justify-center rounded-full"
              : "border-muted-foreground/50 flex size-4 shrink-0 items-center justify-center rounded-full border"
          }
        >
          {lesson.completed && <CheckIcon className="size-3" />}
        </span>
        <span className="truncate">{lesson.title}</span>
      </span>
      <span className="text-muted-foreground/70 text-[11px]">
        {lessonKindLabel(lesson.kind)}
        {!lesson.hasContent && " · queued"}
      </span>
    </button>
  );
}

function CourseSidebar({
  course,
  flatLessons,
  goToLesson,
  progressPercent,
  sections,
  selectedLessonId,
}: {
  course: {
    readonly completedLessonCount: number;
    readonly lessonCount: number;
    readonly title: string;
  };
  flatLessons: readonly LessonLike[];
  goToLesson: (lessonId: string | null) => void;
  progressPercent: number;
  sections: readonly CourseSidebarSection[];
  selectedLessonId: string | null;
}) {
  return (
    <aside className="border-border/70 bg-sidebar md:h-full md:overflow-y-auto md:border-r">
      <div className="space-y-6 px-5 py-6">
        <Link
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium"
          to="/courses"
        >
          <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
          All courses
        </Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {course.title}
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {`${course.completedLessonCount} of ${course.lessonCount} lessons`}
          </p>
          <ProgressFromZero
            className="bg-muted mt-3 h-1.5 w-full"
            label={`Course progress: ${progressPercent}%`}
            percent={progressPercent}
          />
        </div>
        <nav className="space-y-6">
          {sections.map((section) => (
            <div key={section.id ?? section.title}>
              <p className="text-foreground pb-2 text-xs font-semibold tracking-widest uppercase">
                {section.title}
              </p>
              <ul className="space-y-0.5">
                {section.lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <LessonListButton
                      flatLessons={flatLessons}
                      goToLesson={goToLesson}
                      lesson={lesson}
                      selectedLessonId={selectedLessonId}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}

interface LessonData {
  readonly completed: boolean;
  readonly content: LessonContent | null;
  readonly id: string;
  readonly kind: CourseLessonKind;
  readonly position: number;
  readonly title: string;
}

function LessonMainContent({
  courseId,
  goToLesson,
  lessonData,
  lessonIsError,
  lessonIsPending,
  nextLesson,
  onRetryLesson,
  selectedLessonId,
}: {
  courseId: string;
  goToLesson: (lessonId: string | null) => void;
  lessonData: LessonData | undefined;
  lessonIsError: boolean;
  lessonIsPending: boolean;
  nextLesson: LessonLike | undefined;
  onRetryLesson: () => void;
  selectedLessonId: string | null;
}) {
  if (lessonIsError) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <p className="text-sm font-medium">Could not load this lesson</p>
        <p className="text-muted-foreground text-xs">
          The lesson may still be generating. Try again in a moment.
        </p>
        <button
          className="border-border hover:bg-accent focus-visible:ring-ring rounded-md border px-3 py-1.5 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none"
          onClick={onRetryLesson}
          type="button"
        >
          Retry
        </button>
      </div>
    );
  }

  if (selectedLessonId === null) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <LoaderCircleIcon className="text-muted-foreground size-5 animate-spin" />
        <p className="text-sm font-medium">Lessons are being prepared</p>
        <p className="text-muted-foreground text-xs">
          The Director is filling this course. It will appear here shortly.
        </p>
      </div>
    );
  }

  if (lessonIsPending || lessonData === undefined) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <LessonContentSkeleton />
      </div>
    );
  }

  if (
    lessonData.kind === "guided-explanation" &&
    lessonData.content !== null &&
    lessonData.content.kind === "guided-explanation"
  ) {
    return (
      <GuidedExplanationPlayer
        completed={lessonData.completed}
        content={lessonData.content}
        courseId={courseId}
        key={lessonData.id}
        lessonId={lessonData.id}
        nextLessonId={nextLesson?.id ?? null}
        nextLessonTitle={nextLesson?.title ?? null}
        onGoToLesson={goToLesson}
      />
    );
  }

  return (
    <div
      className="mx-auto w-full max-w-2xl flex-1 px-6 py-10"
      key={lessonData.id}
    >
      <article>
        <header className="mb-8">
          <p className="text-muted-foreground mb-2 text-xs tracking-widest uppercase">
            {lessonKindLabel(lessonData.kind)} · Lesson {lessonData.position}
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-balance">
            {lessonData.title}
          </h2>
        </header>
        <LessonContentView lesson={lessonData} />
        <LessonCompletionControls
          completed={lessonData.completed}
          courseId={courseId}
          lessonId={lessonData.id}
          nextLessonId={nextLesson?.id ?? null}
          nextLessonTitle={nextLesson?.title ?? null}
          onGoToLesson={goToLesson}
        />
      </article>
    </div>
  );
}

function CoursePageRoute() {
  const trpc = useTRPC();
  const { courseId } = Route.useParams();
  const { lesson: requestedLessonId } = Route.useSearch();
  const navigate = useNavigate();

  const courseQuery = useQuery({
    ...trpc.courses.get.queryOptions({ courseId }),
    // The course fills live while the Director or the background lesson
    // generator writes content; poll only while any lesson is still empty.
    refetchInterval: (query) => {
      const detail = query.state.data;
      if (detail === undefined) {
        return false;
      }
      const hasUnfilledLesson = detail.sections.some((section) =>
        section.lessons.some((lesson) => !lesson.hasContent)
      );
      return hasUnfilledLesson ? 2500 : false;
    },
  });
  const sections = courseQuery.data?.sections ?? EMPTY_SECTIONS;

  const selectedLessonId = useMemo(() => {
    if (requestedLessonId !== undefined) {
      const requestedLesson = sections
        .flatMap((section) => section.lessons)
        .find((lesson) => lesson.id === requestedLessonId);
      if (requestedLesson !== undefined) {
        return requestedLesson.id;
      }
    }
    return pickInitialLesson(sections);
  }, [requestedLessonId, sections]);

  const lessonQuery = useQuery({
    ...trpc.courses.getLesson.queryOptions({
      courseId,
      lessonId: selectedLessonId ?? "",
    }),
    enabled: selectedLessonId !== null,
    // A skeleton lesson is filled in the background; poll until content lands.
    refetchInterval: (query) =>
      query.state.data?.content === null ? 2000 : false,
  });

  const flatLessons = sections.flatMap((section) => section.lessons);
  const selectedLesson = flatLessons.find(
    (lesson) => lesson.id === selectedLessonId
  );
  const nextLesson =
    selectedLesson === undefined || selectedLessonId === null
      ? flatLessons.at(1)
      : flatLessons.at(flatLessons.indexOf(selectedLesson) + 1);

  function goToLesson(nextLessonId: string | null): void {
    if (nextLessonId === null) {
      void navigate({ to: "/courses" });
      return;
    }
    void navigate({
      params: { courseId },
      search: { lesson: nextLessonId },
      to: "/courses/$courseId",
    });
  }

  // Narration voice lines are filled on demand by the guided explanation
  // player (current sub-lesson module + one ahead) — no course-wide sweep.

  // Content fill: whenever the reader has a lesson open and the next lesson
  // is still an unfilled skeleton, the server starts a detached generation
  // fiber and answers immediately. The course/lesson queries poll until the
  // content lands, so leaving the page never cancels the model work.
  const queryClient = useQueryClient();
  const scheduleNextLesson = useMutation(
    trpc.courses.scheduleNextLessonModule.mutationOptions()
  );
  const openedLessonTriggerRef = useRef<string | null>(null);
  const scheduledLessonRef = useRef<{
    readonly lessonId: string;
    readonly title: string;
  } | null>(null);
  const openedLessonId = selectedLessonId;
  useEffect(() => {
    if (openedLessonId === null) {
      return;
    }
    if (openedLessonTriggerRef.current === openedLessonId) {
      return;
    }
    openedLessonTriggerRef.current = openedLessonId;
    void (async () => {
      try {
        const outcome = await scheduleNextLesson.mutateAsync({
          courseId,
          lessonId: openedLessonId,
        });
        if (outcome.kind === "scheduled") {
          scheduledLessonRef.current = {
            lessonId: outcome.lessonId,
            title: outcome.title,
          };
          void queryClient.invalidateQueries({
            queryKey: trpc.courses.get.queryKey({ courseId }),
          });
        }
      } catch {
        // Background prefetch failure — the reader can retry by reopening
        // the lesson; nothing on screen is broken.
        toast.error("Couldn't queue the next lesson — it will retry later");
      }
    })();
  }, [openedLessonId, courseId, scheduleNextLesson, queryClient, trpc]);

  // Announce completion once the polled course structure sees the target
  // lesson gain content. A ref keeps this out of React state: the toast is
  // the only observable side effect.
  useEffect(() => {
    const scheduledLesson = scheduledLessonRef.current;
    if (scheduledLesson === null) {
      return;
    }
    const targetLesson = sections
      .flatMap((section) => section.lessons)
      .find((lesson) => lesson.id === scheduledLesson.lessonId);
    if (targetLesson?.hasContent === true) {
      scheduledLessonRef.current = null;
      toast.success(`Next lesson ready — ${scheduledLesson.title}`);
      void queryClient.invalidateQueries({
        queryKey: trpc.courses.getLesson.queryKey({
          courseId,
          lessonId: scheduledLesson.lessonId,
        }),
      });
    }
  }, [courseId, queryClient, sections, trpc]);

  if (courseQuery.isPending) {
    return <CoursePageSkeleton />;
  }

  if (courseQuery.isError) {
    return (
      <MissingCourseNotice
        description={courseQuery.error.message}
        title="Course not available"
      />
    );
  }

  const { course } = courseQuery.data;
  const progressPercent =
    course.lessonCount === 0
      ? 0
      : Math.min(
          Math.round((course.completedLessonCount / course.lessonCount) * 100),
          100
        );

  return (
    <div className="bg-background text-foreground flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 md:grid-cols-[300px_1fr]">
        {/* Sidebar: course, headings (sections), subheadings (lessons) */}
        <div className="hidden min-h-0 md:block">
          <CourseSidebar
            course={course}
            flatLessons={flatLessons}
            goToLesson={goToLesson}
            progressPercent={progressPercent}
            sections={sections}
            selectedLessonId={selectedLessonId}
          />
        </div>

        {/* Center: lesson content — scrolls internally, never the page */}
        <main className="flex min-h-0 flex-1 flex-col md:overflow-y-auto">
          <details className="border-border/70 bg-sidebar mx-4 mt-4 rounded-lg border px-4 py-3 md:hidden">
            <summary className="cursor-pointer text-sm font-medium">
              Course lessons · {course.completedLessonCount}/
              {course.lessonCount}
            </summary>
            <nav className="mt-3 space-y-4">
              {sections.map((section) => (
                <div key={section.id ?? section.title}>
                  <p className="text-muted-foreground pb-1 text-[11px] font-semibold tracking-widest uppercase">
                    {section.title}
                  </p>
                  <ul className="space-y-0.5">
                    {section.lessons.map((lesson) => (
                      <li key={lesson.id}>
                        <LessonListButton
                          flatLessons={flatLessons}
                          goToLesson={goToLesson}
                          lesson={lesson}
                          selectedLessonId={selectedLessonId}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </details>
          <LessonMainContent
            courseId={courseId}
            goToLesson={goToLesson}
            lessonData={lessonQuery.data}
            lessonIsError={lessonQuery.isError}
            lessonIsPending={lessonQuery.isPending}
            nextLesson={nextLesson}
            onRetryLesson={() => {
              void lessonQuery.refetch();
            }}
            selectedLessonId={selectedLessonId}
          />
        </main>
      </div>
    </div>
  );
}
