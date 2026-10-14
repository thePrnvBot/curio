import { Button } from "@curio/ui/components/button";
import {
  MessageResponse,
} from "@curio/ui/components/ai-elements/message";
import type {
  GuidedExplanationLessonContent,
  GuidedExplanationStep,
} from "@curio/db/schema/course";
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";

import { highlightCode } from "@curio/ui/components/ai-elements/code-block";
import { playInteractionCue } from "@/utils/sound";

import { LessonCompletionControls } from "./lesson-completion-controls";

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

/** Resolve the shiki language for a step's code. The Director may omit
 * language; guess from the source instead of falling straight to "text",
 * which removes all syntax color. */
function guidedCodeLanguageHint(
  language: string | undefined,
  source: string
): string {
  const aliases: Record<string, string> = {
    cjs: "javascript",
    go: "go",
    js: "javascript",
    jsx: "jsx",
    mjs: "javascript",
    shell: "bash",
    sh: "bash",
    ts: "typescript",
    tsx: "tsx",
    yml: "yaml",
    zsh: "bash",
  };
  const languageHint = language?.trim().toLowerCase();
  if (languageHint !== undefined && languageHint !== "") {
    return aliases[languageHint] ?? languageHint;
  }
  if (/\bdef\s+\w+\s*\(|:\s*$/m.test(source) && !/[;{]\s*$/m.test(source)) {
    return "python";
  }
  if (
    /^\s*(CREATE TABLE|INSERT INTO|SELECT\s|UPDATE\s|ALTER TABLE)/im.test(
      source
    )
  ) {
    return "sql";
  }
  if (
    source.startsWith("#!") ||
    /^\s*(cd |sudo |npm |pnpm |yarn |git |curl |echo )/m.test(source)
  ) {
    return "bash";
  }
  if (
    /^\s*(const |let |import |export |function |async function)/m.test(
      source
    ) ||
    /=>/m.test(source)
  ) {
    return "typescript";
  }
  if (/\bfunc\s+\w+\s*\(/.test(source)) {
    return "go";
  }
  if (/\bfn\s+\w+\s*\(|\blet\s+mut\s/.test(source)) {
    return "rust";
  }
  if (/{\s*"[^"]*"\s*:/.test(source)) {
    return "json";
  }
  return "text";
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
    const applyTokens = (result: {
      bg: string;
      fg: string;
      tokens: ReadonlyArray<ReadonlyArray<any>>;
    }): void => {
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
    };
    // highlightCode is a sync-cache + async-callback API: a cache hit
    // returns the tokens WITHOUT invoking the callback, so the sync result
    // must be consumed here too (otherwise revisited steps lose all
    // highlighting).
    const cachedTokens = highlightCode(
      props.source as never,
      props.language as never
    );
    if (cachedTokens !== null) {
      applyTokens(cachedTokens);
    }
    highlightCode(
      props.source as never,
      props.language as never,
      applyTokens
    );
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
      className="font-mono text-sm leading-6 overflow-x-auto p-4 dark:!bg-[var(--shiki-dark-bg)] dark:!text-[var(--shiki-dark)]"
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
                  <span
                    className="dark:!bg-[var(--shiki-dark-bg)] dark:!text-[var(--shiki-dark)]"
                    key={spanIndex}
                    style={span.style}
                  >
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

export function GuidedExplanationPlayer(props: {
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
        </div>
        {transcriptModules.length > 1 ? (
          // Fixed footer below the scroll area: the pager never drifts
          // with content length.
          <div className="border-border/70 border-t px-6 py-3">
            <div className="flex items-center justify-center gap-2">
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
          </div>
        ) : null}
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
                  language={guidedCodeLanguageHint(
                    currentStep.visual.language,
                    currentStep.visual.source
                  )}
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

