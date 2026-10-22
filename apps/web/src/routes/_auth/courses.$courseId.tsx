import { COURSE_LESSON_KINDS } from "@curio/api/domain/course";
import type { CourseLessonKind } from "@curio/api/domain/course";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, CheckIcon } from "lucide-react";
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
import { useTRPC } from "@/utils/trpc";

// `lesson` is kept only when it's a non-empty string; anything else (missing,
// empty, or a non-string value) falls back to undefined so the route picks the
// initial lesson itself.
const courseSearchSchema = z.object({
  lesson: z.string().min(1).optional().catch(undefined),
});

export const Route = createFileRoute("/_auth/courses/$courseId")({
  component: CoursePageRoute,
  // Skeleton over the orb while the course structure resolves on navigation
  pendingComponent: () => <CoursePageSkeleton />,
  validateSearch: courseSearchSchema,
});

interface LessonLike {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly position: number;
  readonly completed: boolean;
}

const LESSON_KIND_LABELS: Record<CourseLessonKind, string> = {
  video: "Video",
  cards: "Cards",
  animation: "Animation",
  recap: "Recap",
  "guided-explanation": "Guided explanation",
};

/** `kind` arrives as a plain string over the wire, so any value outside the
 * domain union renders itself instead of an undefined label. */
function lessonKindLabel(kind: string): string {
  const known = COURSE_LESSON_KINDS.find((candidate) => candidate === kind);
  return known === undefined ? kind : LESSON_KIND_LABELS[known];
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

function CoursePageRoute() {
  const trpc = useTRPC();
  const { courseId } = Route.useParams();
  const { lesson: requestedLessonId } = Route.useSearch();
  const navigate = useNavigate();

  const courseQuery = useQuery(trpc.courses.get.queryOptions({ courseId }));
  const sections = courseQuery.data?.sections ?? [];

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
    void navigate({
      params: { courseId },
      search: nextLessonId === null ? {} : { lesson: nextLessonId },
      to: "/courses/$courseId",
    });
  }

  // Narration voice lines are filled on demand by the guided explanation
  // player (current sub-lesson module + one ahead) — no course-wide sweep.

  // Content fill: whenever the reader has a lesson open and the next lesson
  // is still an unfilled skeleton, the server generates its content — one
  // lesson per visit, so the course always has the next module ready.
  const queryClient = useQueryClient();
  const generateNextLesson = useMutation(
    trpc.courses.generateNextLessonModule.mutationOptions()
  );
  const openedLessonTriggerRef = useRef<string | null>(null);
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
        const outcome = await generateNextLesson.mutateAsync({
          courseId,
          lessonId: openedLessonId,
        });
        if (outcome.kind === "generated") {
          toast.success(`Next lesson ready — ${outcome.title}`);
          void queryClient.invalidateQueries({
            queryKey: trpc.courses.getLesson.queryKey({
              courseId,
              lessonId: outcome.lessonId,
            }),
          });
          void queryClient.invalidateQueries({
            queryKey: trpc.courses.get.queryKey({ courseId }),
          });
        }
      } catch {
        // Background prefetch failure — tell the reader briefly; the call
        // retries automatically the next time they open a lesson.
        toast.error(
          "Couldn't generate the next lesson yet — it'll retry when you return to it"
        );
      }
    })();
  }, [openedLessonId, courseId, generateNextLesson, queryClient, trpc]);

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

  const course = courseQuery.data.course;
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
                    {section.lessons.map((lesson) => {
                      const isActive = lesson.id === selectedLessonId;
                      return (
                        <li key={lesson.id}>
                          <button
                            className={
                              isActive
                                ? "bg-accent text-foreground hover:bg-accent w-full rounded-md px-2 py-1.5 text-left text-sm"
                                : "hover:bg-accent text-muted-foreground hover:text-foreground w-full rounded-md px-2 py-1.5 text-left text-sm"
                            }
                            onClick={() => goToLesson(lesson.id)}
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
                                {lesson.completed && (
                                  <CheckIcon className="size-3" />
                                )}
                              </span>
                              <span className="truncate">{lesson.title}</span>
                            </span>
                            <span className="text-muted-foreground/70 text-[11px]">
                              {lessonKindLabel(lesson.kind)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
        </aside>

        {/* Center: lesson content — scrolls internally, never the page */}
        <main className="flex min-h-0 flex-1 flex-col md:overflow-y-auto">
          {lessonQuery.isPending ||
          selectedLessonId === null ||
          lessonQuery.isError ? (
            <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
              <LessonContentSkeleton />
            </div>
          ) : lessonQuery.data.kind === "guided-explanation" &&
            lessonQuery.data.content !== null &&
            lessonQuery.data.content.kind === "guided-explanation" ? (
            <GuidedExplanationPlayer
              completed={lessonQuery.data.completed}
              content={lessonQuery.data.content}
              courseId={courseId}
              lessonId={lessonQuery.data.id}
              nextLessonId={nextLesson?.id ?? null}
              nextLessonTitle={nextLesson?.title ?? null}
              onGoToLesson={goToLesson}
            />
          ) : (
            <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
              <article>
                <header className="mb-8">
                  <p className="text-muted-foreground mb-2 text-xs tracking-widest uppercase">
                    {lessonKindLabel(lessonQuery.data.kind)} · Lesson{" "}
                    {lessonQuery.data.position ?? 1}
                  </p>
                  <h2 className="text-3xl font-semibold tracking-tight text-balance">
                    {lessonQuery.data.title}
                  </h2>
                </header>
                <LessonContentView lesson={lessonQuery.data} />
                <LessonCompletionControls
                  completed={lessonQuery.data.completed}
                  courseId={courseId}
                  lessonId={lessonQuery.data.id}
                  nextLessonId={nextLesson?.id ?? null}
                  nextLessonTitle={nextLesson?.title ?? null}
                  onGoToLesson={goToLesson}
                />
              </article>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
