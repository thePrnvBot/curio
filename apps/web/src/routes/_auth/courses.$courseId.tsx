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
import type {
  GuidedExplanationLessonContent,
  GuidedExplanationStep,
  LessonContent,
} from "@curio/db/schema/course";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from "react";

import { highlightCode } from "@curio/ui/components/ai-elements/code-block";
import { playInteractionCue } from "@/utils/sound";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/courses/$courseId")({
  component: CoursePageRoute,
  // Skeleton over the orb while the course structure resolves on navigation
  pendingComponent: () => <CoursePageSkeleton />,
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
  "guided-explanation": "Guided explanation",
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

        {/* Center: lesson content — scrolls internally, never the page */}
        <main className="flex min-h-0 flex-1 flex-col md:overflow-y-auto">
          {lessonQuery.isPending || selectedLessonId === null || lessonQuery.isError ? (
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
            </div>
          )}
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
      return <RecapExerciseView questions={content.questions} />;
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

/** Narrated, step-sequenced explanation player: transcript on the left,
 * synced visuals on the right, timer-driven playback (no voice yet). */
function guidedStepDurationMs(step: GuidedExplanationStep): number {
  if (step.durationMs !== undefined) {
    return step.durationMs;
  }
  const wordCount = step.narration.trim().split(/\s+/).length;
  return Math.max(2400, Math.round(wordCount * 340) + 900);
}

/** Sentence segmentation for the transcript: the active sentence lights up
 * while its step narrates, so the prose reads as one flowing paragraph. */
function narrationSentences(narration: string): string[] {
  return narration
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

interface GuidedStageLine {
  readonly spans: ReadonlyArray<{
    readonly content: string;
    readonly style?: CSSProperties;
  }>;
}

/** Code stage with shiki highlighting and staggered line-in motion. Uses the
 * shared highlighter cache from the CodeBlock module; falls back to plain
 * monospace until tokens are ready, identical layout either way. */
function GuidedCodeStage(props: {
  source: string;
  language: string;
}): ReactElement {
  const [highlighted, setHighlighted] = useState<{
    bg: string;
    fg: string;
    lines: GuidedStageLine[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    highlightCode(props.source as never, props.language as never, (result) => {
      if (cancelled) {
        return;
      }
      setHighlighted({
        bg: result.bg,
        fg: result.fg,
        lines: result.tokens.map((line) => ({
          spans: line.map((token) => {
            let fontStyle: "italic" | undefined;
            let fontWeight: "bold" | undefined;
            let textDecoration: "underline" | undefined;
            if ((token.fontStyle ?? 0) & 1) {
              fontStyle = "italic";
            }
            if ((token.fontStyle ?? 0) & 2) {
              fontWeight = "bold";
            }
            if ((token.fontStyle ?? 0) & 4) {
              textDecoration = "underline";
            }
            return {
              content: token.content,
              style: {
                backgroundColor: token.bgColor,
                color: token.color,
                fontStyle,
                fontWeight,
                textDecoration,
                ...token.htmlStyle,
              } as CSSProperties,
            };
          }),
        })),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [props.language, props.source]);

  const fallbackLines: GuidedStageLine[] = props.source
    .split("\n")
    .map((line) => ({ spans: [{ content: line }] }));

  const lines = highlighted === null ? fallbackLines : highlighted.lines;

  return (
    <pre
      className="font-mono text-sm leading-6 overflow-x-auto p-4"
      style={
        highlighted === null
          ? undefined
          : { backgroundColor: highlighted.bg, color: highlighted.fg }
      }
    >
      <code>
        {lines.map((line, lineIndex) => (
          <span
            className="animate-guided-block-in block"
            key={lineIndex}
            style={
              {
                "--guided-delay": `${120 + Math.min(lineIndex * 45, 900)}ms`,
              } as CSSProperties
            }
          >
            {line.spans.length === 0
              ? "\u00A0"
              : line.spans.map((span, spanIndex) => (
                  <span key={spanIndex} style={span.style}>
                    {span.content}
                  </span>
                ))}
          </span>
        ))}
      </code>
    </pre>
  );
}

/** Markdown stage: prose blocks drift in one by one, in narration order. */
function GuidedMarkdownStage(props: { source: string }): ReactElement {
  const blocks = props.source
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  return (
    <div className="space-y-4 text-sm leading-relaxed">
      {blocks.map((block, blockIndex) => (
        <div
          className="animate-guided-block-in"
          key={blockIndex}
          style={
            {
              "--guided-delay": `${120 + Math.min(blockIndex * 90, 800)}ms`,
            } as CSSProperties
          }
        >
          <MessageResponse>{block}</MessageResponse>
        </div>
      ))}
    </div>
  );
}

function GuidedExplanationPlayer(props: {
  content: GuidedExplanationLessonContent;
  completed: boolean;
  courseId: string;
  lessonId: string;
  nextLessonId: string | null;
  nextLessonTitle: string | null;
  onGoToLesson: (lessonId: string | null) => void;
}): ReactElement {
  const steps = props.content.steps;
  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [stepProgress, setStepProgress] = useState(0);

  // Restart the explanation when a different guided lesson is opened.
  useEffect(() => {
    setStepIndex(0);
    setStepProgress(0);
    setIsPlaying(true);
  }, [props.lessonId]);

  const isLastStep = stepIndex === steps.length - 1;

  function goToStep(nextStepIndex: number): void {
    const boundedIndex = Math.max(0, Math.min(nextStepIndex, steps.length - 1));
    if (boundedIndex !== stepIndex) {
      playInteractionCue("select", {
        direction: boundedIndex > stepIndex ? "forward" : "back",
        emphasis: "subtle",
      });
    }
    setStepIndex(boundedIndex);
    setStepProgress(0);
  }

  // rAF-driven step clock: drives the per-step progress bar and advances to
  // the next step when the current step's duration elapses. Pausing simply
  // tears the clock down; progress freezes at the frozen frame.
  useEffect(() => {
    if (!isPlaying) {
      return undefined;
    }
    setStepProgress(0);
    const stepDurationMs = guidedStepDurationMs(steps[stepIndex]);
    const startedAt = performance.now();
    let rafId = 0;
    const tick = (): void => {
      const percent = Math.min(
        ((performance.now() - startedAt) / stepDurationMs) * 100,
        100,
      );
      setStepProgress(percent);
      if (percent < 100) {
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);
    const advanceTimer = window.setTimeout(() => {
      if (isLastStep) {
        setIsPlaying(false);
        return;
      }
      setStepIndex((currentStepIndex) => currentStepIndex + 1);
    }, stepDurationMs);
    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(advanceTimer);
    };
  }, [isPlaying, stepIndex, isLastStep, steps]);

  // Keyboard: space toggles playback, arrows step (institute-style).
  useEffect(() => {
    function handleKeyDown(keyboardEvent: KeyboardEvent): void {
      const eventTarget = keyboardEvent.target as HTMLElement | null;
      if (
        eventTarget !== null &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(eventTarget.tagName)
      ) {
        return;
      }
      if (keyboardEvent.code === "Space") {
        keyboardEvent.preventDefault();
        playInteractionCue("toggle");
        setIsPlaying((currentlyPlaying) => !currentlyPlaying);
        return;
      }
      if (keyboardEvent.code === "ArrowRight") {
        keyboardEvent.preventDefault();
        goToStep(stepIndex + 1);
        return;
      }
      if (keyboardEvent.code === "ArrowLeft") {
        keyboardEvent.preventDefault();
        goToStep(stepIndex - 1);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [stepIndex, steps.length]);

  // Transcript: the narration reads as one continuous paragraph; the sentence
  // currently being narrated lights up. Sentences are flattened step by step
  // so the lit index tracks playback across step boundaries.
  const transcriptSentences = useMemo(() => {
    const sentences: Array<{ stepIndex: number; text: string }> = [];
    steps.forEach((step, stepRefIndex) => {
      for (const sentence of narrationSentences(step.narration)) {
        sentences.push({ stepIndex: stepRefIndex, text: sentence });
      }
    });
    return sentences;
  }, [steps]);
  const stepSentenceOffsets = useMemo(() => {
    const offsets: number[] = [];
    let offset = 0;
    for (const step of steps) {
      offsets.push(offset);
      offset += narrationSentences(step.narration).length;
    }
    return offsets;
  }, [steps]);

  const stepSentenceCount = Math.max(
    1,
    narrationSentences(steps[stepIndex]?.narration ?? "").length
  );
  const activeSentenceIndex = Math.min(
    stepSentenceOffsets[stepIndex] +
      Math.floor((stepProgress / 100) * stepSentenceCount),
    transcriptSentences.length - 1
  );

  // Keep the lit sentence in view.
  const transcriptRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    transcriptRef.current
      ?.querySelector(`[data-transcript-sentence="${activeSentenceIndex}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeSentenceIndex]);

  const currentStep = steps[stepIndex];

  // Long narrations are broken into sub-lesson modules - contiguous step
  // groups kept short enough that the transcript never grows tall enough to
  // need heavy wheel scrolling. Playback crosses module boundaries on its
  // own as steps advance.
  const transcriptModules = useMemo(() => {
    const modules: Array<{ endStep: number; startStep: number }> = [];
    let moduleStartStep = 0;
    let moduleCharacters = 0;
    steps.forEach((step, stepIdx) => {
      moduleCharacters += step.narration.length;
      if (moduleCharacters >= 900 && stepIdx + 1 < steps.length) {
        modules.push({ endStep: stepIdx + 1, startStep: moduleStartStep });
        moduleStartStep = stepIdx + 1;
        moduleCharacters = 0;
      }
    });
    modules.push({ endStep: steps.length, startStep: moduleStartStep });
    return modules;
  }, [steps]);
  const activeModule =
    transcriptModules.find(
      (module) => stepIndex >= module.startStep && stepIndex < module.endStep
    ) ?? transcriptModules[0];
  const activeModuleIndex = transcriptModules.indexOf(activeModule);
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: 0 });
  }, [activeModuleIndex]);

  const transcript = (
    <aside className="border-border/70 w-full shrink-0 border-b lg:h-full lg:w-[360px] lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col">
        <div
          className="min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-6"
          ref={transcriptRef}
        >
          {/* Only the active sub-lesson module is on the page; the rest are
           * reached through the continuar buttons below. */}
          <p className="text-[15px] leading-7">
            {transcriptSentences.map((sentence, sentenceRefIndex) => {
              if (
                sentence.stepIndex < activeModule.startStep ||
                sentence.stepIndex >= activeModule.endStep
              ) {
                return null;
              }
              const isPast = sentenceRefIndex < activeSentenceIndex;
              const isActive = sentenceRefIndex === activeSentenceIndex;
              return (
                <span key={sentenceRefIndex}>
                  <span
                    aria-current={isActive || undefined}
                    className={
                      isActive
                        ? "bg-primary/10 text-foreground cursor-pointer rounded-sm px-0.5 -mx-0.5 font-medium [box-decoration-break:clone] transition-colors duration-200"
                        : isPast
                          ? "text-foreground/55 cursor-pointer [box-decoration-break:clone] transition-colors duration-200 hover:text-foreground/80"
                          : "text-foreground/35 cursor-pointer [box-decoration-break:clone] transition-colors duration-200 hover:text-foreground/60"
                    }
                    data-transcript-sentence={sentenceRefIndex}
                    onClick={() => {
                      goToStep(sentence.stepIndex);
                    }}
                  >
                    {sentence.text}
                  </span>{" "}
                </span>
              );
            })}
          </p>
          {transcriptModules.length > 1 ? (
            <div className="mt-5 flex items-center justify-center gap-2">
              <button
                aria-label="Previous sub-lesson"
                className="bg-background text-muted-foreground hover:text-foreground hover:border-ring flex size-7 items-center justify-center rounded-full border transition-colors disabled:opacity-40 disabled:hover:text-muted-foreground"
                disabled={activeModuleIndex === 0}
                onClick={() => {
                  goToStep(
                    transcriptModules[activeModuleIndex - 1].startStep
                  );
                }}
                type="button"
              >
                <ArrowLeftIcon aria-hidden="true" className="size-3.5" />
              </button>
              <button
                aria-label="Next sub-lesson"
                className="bg-background text-muted-foreground hover:text-foreground hover:border-ring flex size-7 items-center justify-center rounded-full border transition-colors disabled:opacity-40 disabled:hover:text-muted-foreground"
                disabled={activeModuleIndex === transcriptModules.length - 1}
                onClick={() => {
                  goToStep(transcriptModules[activeModuleIndex + 1].startStep);
                }}
                type="button"
              >
                <ChevronRightIcon aria-hidden="true" className="size-3.5" />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );

  const stageAndControls = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-3xl">
          {props.content.intro !== undefined && stepIndex === 0 && (
            <div
              className="text-muted-foreground mb-4 mt-2 text-sm leading-relaxed"
              style={
                {
                  animationDelay: "60ms",
                } as CSSProperties
              }
            >
              <MessageResponse>{props.content.intro}</MessageResponse>
            </div>
          )}

          <div
            className="bg-card rounded-xl border"
            key={stepIndex}
          >
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
                {currentStep.visual.kind === "code"
                  ? (currentStep.visual.language ?? "Code")
                  : "Notes"}
              </p>
              <p className="text-muted-foreground text-xs tabular-nums">
                {`Step ${stepIndex + 1} of ${steps.length}`}
              </p>
            </div>
            <div className="p-5">
              {currentStep.visual.kind === "code" ? (
                <GuidedCodeStage
                  language={currentStep.visual.language ?? "text"}
                  source={currentStep.visual.source}
                />
              ) : (
                <GuidedMarkdownStage source={currentStep.visual.source} />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="border-border/70 border-t px-6 pt-4 pb-2">
        <div className="bg-muted mx-auto mb-3 h-1 w-full max-w-3xl overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-[width] duration-150 ease-linear"
            style={{ width: `${Math.min(stepProgress, 100)}%` }}
          />
        </div>
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              aria-label={isPlaying ? "Pause explanation" : "Play explanation"}
              disabled={isLastStep && !isPlaying}
              onClick={() => {
                playInteractionCue("toggle");
                setIsPlaying((currentlyPlaying) => !currentlyPlaying);
              }}
              size="icon"
              variant={isPlaying ? "secondary" : "default"}
            >
              {isPlaying ? (
                <PauseIcon className="size-4" aria-hidden="true" />
              ) : (
                <PlayIcon className="size-4" aria-hidden="true" />
              )}
            </Button>
            <Button
              aria-label="Previous step"
              disabled={stepIndex === 0}
              onClick={() => {
                goToStep(stepIndex - 1);
              }}
              size="icon"
              variant="ghost"
            >
              <SkipBackIcon className="size-4" aria-hidden="true" />
            </Button>
            <Button
              aria-label="Next step"
              disabled={isLastStep}
              onClick={() => {
                goToStep(stepIndex + 1);
              }}
              size="icon"
              variant="ghost"
            >
              <SkipForwardIcon className="size-4" aria-hidden="true" />
            </Button>
            <span className="text-muted-foreground text-xs tabular-nums">
              {isPlaying ? "Playing" : isLastStep ? "Complete" : "Paused"} ·{" "}
              {stepIndex + 1}/{steps.length}
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-6 pb-6">
        <LessonCompletionControls
          className="mt-2"
          completed={props.completed}
          courseId={props.courseId}
          lessonId={props.lessonId}
          nextLessonId={props.nextLessonId}
          nextLessonTitle={props.nextLessonTitle}
          onGoToLesson={props.onGoToLesson}
        />
      </div>
    </div>
  );

  return (
    <div className="grid h-full min-h-0 flex-1 lg:grid-cols-[minmax(300px,380px)_1fr]">
      {transcript}
      {stageAndControls}
    </div>
  );
}

function RecapExerciseView(props: {
  questions: readonly RecapQuestion[];
}): ReactElement {
  // Picked option index per question (undefined until answered)
  const [pickedOptions, setPickedOptions] = useState<
    Record<number, number | undefined>
  >({});
  const [checked, setChecked] = useState(false);

  const allAnswered = props.questions.every(
    (_question, questionIndex) => pickedOptions[questionIndex] !== undefined
  );
  const correctCount = checked
    ? props.questions.filter(
        (question, questionIndex) =>
          pickedOptions[questionIndex] === question.answerIndex
      ).length
    : 0;
  const allCorrect = checked && correctCount === props.questions.length;

  function resetAnswers(): void {
    setPickedOptions({});
    setChecked(false);
  }

  const optionClass = ({
    checked,
    isPicked,
    isAnswer,
  }: {
    checked: boolean;
    isPicked: boolean;
    isAnswer: boolean;
  }): string => {
    if (checked) {
      if (isAnswer) {
        return "border-primary bg-primary/10 text-primary flex w-full items-center justify-between gap-3 rounded-lg px-3.5 py-2.5 text-left text-sm";
      }
      if (isPicked) {
        return "border-destructive/60 bg-destructive/5 text-destructive flex w-full items-center justify-between gap-3 rounded-lg px-3.5 py-2.5 text-left text-sm";
      }
      return "text-muted-foreground/60 w-full rounded-lg border px-3.5 py-2.5 text-left text-sm";
    }
    return isPicked
      ? "border-primary bg-primary/10 text-primary w-full rounded-lg px-3.5 py-2.5 text-left text-sm"
      : "hover:border-ring hover:bg-accent text-foreground w-full rounded-lg border px-3.5 py-2.5 text-left text-sm";
  };

  return (
    <div className="space-y-4">
      {props.questions.map((question, questionIndex) => {
        const pickedOption = pickedOptions[questionIndex];
        const isPickedCorrect = pickedOption === question.answerIndex;
        return (
          <div className="bg-card rounded-xl border p-5" key={question.prompt}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium">
                <span className="text-muted-foreground mr-2">
                  {questionIndex + 1}
                </span>
                {question.prompt}
              </p>
              {checked &&
                (isPickedCorrect ? (
                  <span className="bg-primary/10 text-primary flex size-6 shrink-0 items-center justify-center rounded-full">
                    <CheckIcon className="size-3.5" aria-hidden="true" />
                  </span>
                ) : (
                  <span className="border-destructive/40 bg-destructive/10 text-destructive flex size-6 shrink-0 items-center justify-center rounded-full border">
                    <XIcon className="size-3.5" aria-hidden="true" />
                  </span>
                ))}
            </div>
            <div className="mt-3 space-y-2">
              {question.options.map((option, optionIndex) => (
                <button
                  className={optionClass({
                    checked,
                    isPicked: pickedOption === optionIndex,
                    isAnswer: optionIndex === question.answerIndex,
                  })}
                  disabled={checked}
                  key={option}
                  onClick={() => {
                    setPickedOptions({
                      ...pickedOptions,
                      [questionIndex]: optionIndex,
                    });
                  }}
                  type="button"
                >
                  <span>{option}</span>
                  {checked && optionIndex === question.answerIndex && (
                    <span className="text-xs font-medium opacity-70">
                      correct
                    </span>
                  )}
                  {checked && pickedOption === optionIndex && !isPickedCorrect && (
                    <span className="text-xs font-medium opacity-70">
                      your answer
                    </span>
                  )}
                </button>
              ))}
            </div>
            {checked && pickedOption !== undefined && !isPickedCorrect && (
              <div className="border-destructive/30 bg-destructive/5 mt-3 rounded-lg border-l-3 px-3.5 py-2.5">
                <p className="text-destructive text-xs font-semibold">
                  {question.explanation !== undefined && question.explanation.length > 0
                    ? "Why not"
                    : "Not quite"}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                  {question.explanation ??
                    "Revisit the lesson above and try a fresh take."}
                </p>
              </div>
            )}
          </div>
        );
      })}

      <div className="mt-3 flex items-center justify-between gap-4">
        <p className="text-muted-foreground text-xs">
          {checked
            ? allCorrect
              ? "All correct - move on when ready."
              : `${correctCount} of ${props.questions.length} correct`
            : allAnswered
              ? `${props.questions.length} question${
                  props.questions.length === 1 ? "" : "s"
                } answered - ready to check`
              : "Pick an option for every question"}
        </p>
        <div className="flex items-center gap-2">
          {checked && !allCorrect ? (
            <Button onClick={resetAnswers} size="sm" variant="outline">
              Try again
            </Button>
          ) : null}
          {checked ? null : (
            <Button
              disabled={!allAnswered}
              onClick={() => {
                setChecked(true);
              }}
              size="sm"
            >
              Check answers
            </Button>
          )}
        </div>
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
  /** How far the block sits below the content above it; the article layout
   * uses the loose default, the player passes a tight one. */
  className?: string;
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
        playInteractionCue("success", { emphasis: "strong" });
      } else {
        playInteractionCue("success", { emphasis: "subtle" });
      }
      props.onGoToLesson(props.nextLessonId);
    } finally {
      setIsCompleting(false);
    }
  }

  return (
    <div className={props.className ?? "mt-10"}>
      {earnedBadgeLabel !== null && (
        <div className="border-primary/30 bg-primary/10 mb-3 flex items-center gap-2 rounded-lg border px-4 py-3">
          <Badge>{"New badge"}</Badge>
          <p className="text-sm font-medium">{earnedBadgeLabel}</p>
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
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
    <div className="grid min-h-0 flex-1 md:grid-cols-[300px_1fr]">
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
    <div className="flex min-h-0 flex-1 items-center justify-center px-6">
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

