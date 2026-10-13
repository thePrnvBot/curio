import { Badge } from "@curio/ui/components/badge";
import { Button } from "@curio/ui/components/button";
import { Skeleton } from "@curio/ui/components/skeleton";
import {
  MessageResponse,
} from "@curio/ui/components/ai-elements/message";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import type { LessonContent } from "@curio/db/schema/course";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronRightIcon,
} from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/courses/$courseId")({
  component: CoursePageRoute,
  validateSearch: (search: Record<string, unknown>): { lesson?: string } => ({
    lesson:
      typeof search.lesson === "string" && search.lesson.length > 0
        ? search.lesson
        : undefined,
  }),
});

interface LessonLike {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly position: number;
  readonly completed: boolean;
}

const LESSON_KIND_LABELS: Record<string, string> = {
  animation: "Animation",
  cards: "Cards",
  recap: "Recap",
  video: "Video",
};

/** The single lesson the reader currently has open: first incomplete lesson,
 * falling back to the last lesson of the course. */
function pickInitialLesson(sections: readonly { lessons: readonly LessonLike[] }[]): string | null {
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
  const nextLesson = selectedLesson === undefined || selectedLessonId === null
    ? flatLessons.at(1)
    : flatLessons.at(flatLessons.indexOf(selectedLesson) + 1);

  function goToLesson(nextLessonId: string | null): void {
    void navigate({
      params: { courseId },
      search: nextLessonId === null ? {} : { lesson: nextLessonId },
      to: "/courses/$courseId",
    });
  }

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
          Math.round(
            (course.completedLessonCount / course.lessonCount) * 100
          ),
          100
        );

  return (
    <div className="bg-background text-foreground min-h-svh">
      <div className="grid md:grid-cols-[300px_1fr]">
        {/* Sidebar: course, headings (sections), subheadings (lessons) */}
        <aside className="border-border/70 bg-sidebar md:min-h-svh md:border-r">
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
              <div className="bg-muted mt-3 h-1.5 w-full overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${Math.max(progressPercent, 2)}%` }}
                />
              </div>
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
                              {LESSON_KIND_LABELS[lesson.kind] ?? lesson.kind}
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

        {/* Center: lesson content */}
        <main className="flex min-h-svh flex-col">
          <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
            {lessonQuery.isPending || selectedLessonId === null ? (
              <LessonContentSkeleton />
            ) : lessonQuery.isError ? (
              <LessonContentSkeleton />
            ) : (
              <article>
                <header className="mb-8">
                  <p className="text-muted-foreground mb-2 text-xs tracking-widest uppercase">
                    {LESSON_KIND_LABELS[lessonQuery.data.kind] ??
                      lessonQuery.data.kind}{" "}
                    Â· Lesson {lessonQuery.data.position ?? 1}
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
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function LessonContentView(props: {
  lesson: {
    readonly completed: boolean;
    readonly content: LessonContent | null;
    readonly id: string;
    readonly kind: string;
    readonly position: number;
    readonly title: string;
  };
}): ReactElement | null {
  const content = props.lesson.content;

  if (content === null) {
    return (
      <div className="bg-card/50 rounded-xl border p-6 text-center">
        <p className="font-medium">Content for this lesson is on its way</p>
        <p className="text-muted-foreground mt-1 text-sm">
          This lesson was created before the full course pages shipped. Ask the
          Director to rebuild it for finished content.
        </p>
      </div>
    );
  }

  switch (content.kind) {
    case "animation":
      return (
        <div className="space-y-6">
          <div className="prose-sm">
            <MessageResponse>{content.body}</MessageResponse>
          </div>
          <iframe
            className="bg-background w-full rounded-xl border"
            sandbox="allow-scripts allow-forms"
            srcDoc={content.html}
            style={{ height: 420 }}
            title="Interactive animation"
          />
        </div>
      );
    case "cards":
      return (
        <div className="space-y-6">
          {content.body !== undefined && (
            <div className="prose-sm">
              <MessageResponse>{content.body}</MessageResponse>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {content.cards.map((card) => (
              <div className="bg-card rounded-xl border p-5" key={card.title}>
                <p className="font-medium">{card.title}</p>
                <div className="text-muted-foreground mt-2 text-sm">
                  <MessageResponse>{card.body}</MessageResponse>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    case "recap":
      return (
        <RecapExerciseView
          questions={content.questions}
          title={props.lesson.title}
        />
      );
    case "video":
      return (
        <div className="space-y-6">
          <div className="bg-muted/50 flex aspect-video items-center justify-center rounded-xl border">
            <span className="text-muted-foreground/50 text-xs tracking-widest uppercase">
              Video slot
            </span>
          </div>
          <div className="prose-sm">
            <MessageResponse>{content.body}</MessageResponse>
          </div>
        </div>
      );
    default: {
      return null;
    }
  }
}

interface RecapQuestion {
  readonly answerIndex: number;
  readonly explanation?: string;
  readonly options: readonly string[];
  readonly prompt: string;
}

function RecapExerciseView(props: {
  questions: readonly RecapQuestion[];
  title: string;
}): ReactElement {
  // Picked option index per question (null until answered)
  const [pickedOptions, setPickedOptions] = useState<
    Record<number, number | undefined>
  >({});
  const [checked, setChecked] = useState(false);

  const allAnswered = props.questions.every(
    (_question, questionIndex) => pickedOptions[questionIndex] !== undefined
  );
  const allCorrect = checked
    ? props.questions.every(
        (question, questionIndex) =>
          pickedOptions[questionIndex] === question.answerIndex
      )
    : false;

  function resetAnswers(): void {
    setPickedOptions({});
    setChecked(false);
  }

  return (
    <div className="space-y-6">
      {props.questions.map((question, questionIndex) => {
        const pickedOption = pickedOptions[questionIndex];
        const isCorrect = pickedOption === question.answerIndex;
        return (
          <div className="bg-card rounded-xl border p-5" key={question.prompt}>
            <p className="font-medium">
              {questionIndex + 1}. {question.prompt}
            </p>
            <div className="mt-3 space-y-2">
              {question.options.map((option, optionIndex) => {
                const isPicked = pickedOption === optionIndex;
                let optionClass =
                  "text-muted-foreground hover:bg-accent rounded-lg border px-3 py-2 text-sm";
                if (!checked) {
                  optionClass =
                    isPicked === true
                      ? "border-primary bg-primary/10 text-primary rounded-lg px-3 py-2 text-sm"
                      : "text-muted-foreground hover:bg-accent rounded-lg border px-3 py-2 text-sm";
                } else if (optionIndex === question.answerIndex) {
                  optionClass =
                    "border-primary bg-primary/10 text-primary flex items-center justify-between rounded-lg px-3 py-2 text-sm";
                } else if (isPicked) {
                  optionClass =
                    "border-destructive bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm";
                }
                return (
                  <button
                    className={optionClass}
                    disabled={checked}
                    key={option}
                    onClick={() => {
                      setPickedOptions({
                        ...pickedOptions,
                        [questionIndex]: optionIndex,
                      });
                      if (checked) {
                        setChecked(false);
                      }
                    }}
                    type="button"
                  >
                    <span>{option}</span>
                    {checked && optionIndex === question.answerIndex && (
                      <CheckIcon className="size-4" />
                    )}
                  </button>
                );
              })}
            </div>
            {checked && pickedOption !== undefined && !isCorrect && (
              <p className="text-muted-foreground mt-2 text-xs">
                {question.explanation ?? "Not quite - revisit the lesson above."}
              </p>
            )}
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-4">
        {!checked ? (
          <Badge variant="outline">
            {allAnswered ? "Ready to check" : "Answer every question"}
          </Badge>
        ) : (
          <Badge variant={allCorrect ? "default" : "destructive"}>
            {allCorrect ? "All correct" : "Keep trying"}
          </Badge>
        )}
        {checked && !allCorrect ? (
          <Button onClick={resetAnswers} size="sm" variant="outline">
            Reset answers
          </Button>
        ) : null}
        {!checked ? (
          <Button
            disabled={!allAnswered}
            onClick={() => {
              setChecked(true);
            }}
            size="sm"
          >
            Check answers
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function LessonCompletionControls(props: {
  completed: boolean;
  courseId: string;
  lessonId: string;
  nextLessonId: string | null;
  nextLessonTitle: string | null;
  onGoToLesson: (lessonId: string | null) => void;
}): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [isCompleting, setIsCompleting] = useState(false);
  const [earnedBadgeLabel, setEarnedBadgeLabel] = useState<string | null>(null);

  const completeLesson = useMutation(
    trpc.courses.completeLesson.mutationOptions()
  );

  async function completeAndContinue(): Promise<void> {
    if (props.completed) {
      props.onGoToLesson(props.nextLessonId);
      return;
    }
    setIsCompleting(true);
    try {
      const result = await completeLesson.mutateAsync({
        courseId: props.courseId,
        lessonId: props.lessonId,
      });
      void queryClient.invalidateQueries({
        queryKey: trpc.courses.pathKey(),
      });
      if (result.badge !== undefined && result.badge !== null) {
        setEarnedBadgeLabel(result.badge.label);
      }
      props.onGoToLesson(props.nextLessonId);
    } finally {
      setIsCompleting(false);
    }
  }

  return (
    <div className="mt-10">
      {earnedBadgeLabel !== null && (
        <div className="border-primary/30 bg-primary/10 mb-4 flex items-center gap-2 rounded-lg border px-4 py-3">
          <Badge>{"New badge"}</Badge>
          <p className="text-sm font-medium">{earnedBadgeLabel}</p>
        </div>
      )}
      <div className="border-border/70 flex items-center justify-between gap-4 border-t pt-6">
        <div>
          <p className="text-sm font-medium">
            {props.completed
              ? "Lesson completed"
              : props.nextLessonTitle === null
                ? "Finish the course"
                : "Up next"}
          </p>
          <p className="text-muted-foreground text-xs">
            {props.nextLessonTitle ?? "One lesson away from a new badge"}
          </p>
        </div>
        <Button
          className="gap-1"
          disabled={isCompleting}
          onClick={() => {
            void completeAndContinue();
          }}
          size="sm"
        >
          {props.completed
            ? props.nextLessonId === null
              ? "Back to courses"
              : "Continue"
            : props.nextLessonId === null
              ? "Complete course"
              : "Complete & continue"}
          <ChevronRightIcon className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function LessonContentSkeleton(): ReactElement {
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

function CoursePageSkeleton(): ReactElement {
  return (
    <div className="grid min-h-svh md:grid-cols-[300px_1fr]">
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

function MissingCourseNotice(props: {
  description: string;
  title: string;
}): ReactElement {
  return (
    <div className="flex min-h-svh items-center justify-center px-6">
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

