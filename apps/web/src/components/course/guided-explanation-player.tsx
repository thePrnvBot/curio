import type { GuidedExplanationLessonContent } from "@curio/db/schema/course";
import { MessageResponse } from "@curio/ui/components/ai-elements/message";
import { Button } from "@curio/ui/components/button";
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CSSProperties, ReactElement } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { playInteractionCue } from "@/utils/sound";
import {
  countCachedUtterances,
  getOrSynthesizeUtterance,
  readVoicePreferences,
  subscribeToVoiceCacheWrites,
  subscribeToVoicePreferences,
  subscribeToVoiceStatus,
} from "@/utils/voice/voice-manager";
import type {
  VoiceManagerStatus,
  VoicePreferences,
} from "@/utils/voice/voice-manager";
import {
  createNarrationChannel,
  narrationLog,
} from "@/utils/voice/voice-playback";
import type { NarrationChannel } from "@/utils/voice/voice-playback";

import {
  guidedCodeLanguageHint,
  GuidedCodeStage,
  GuidedMarkdownStage,
  reducedStageVariants,
  stageVariants,
} from "./guided-explanation-stages";
import {
  guidedStepDurationMs,
  narrationSentences,
} from "./guided-explanation-timing";
import { speakStepLines } from "./guided-explanation-voice";
import { LessonCompletionControls } from "./lesson-completion-controls";

/** A contiguous group of steps kept short enough that the transcript never
 * grows tall enough to need heavy wheel scrolling. */
interface TranscriptModule {
  readonly endStep: number;
  readonly startStep: number;
}

/** Transcript sentence coloring past/current/upcoming reading position. */
function transcriptSentenceClass(isPast: boolean, isActive: boolean): string {
  if (isActive) {
    return "bg-primary/10 text-foreground cursor-pointer rounded-sm px-0.5 -mx-0.5 font-medium [box-decoration-break:clone] transition-colors duration-200";
  }
  return isPast
    ? "text-foreground/55 cursor-pointer [box-decoration-break:clone] transition-colors duration-200 hover:text-foreground/80"
    : "text-foreground/35 cursor-pointer [box-decoration-break:clone] transition-colors duration-200 hover:text-foreground/60";
}

/** Short playback label shown beside the seek buttons. */
function playbackStatusLabel(isPlaying: boolean, isLastStep: boolean): string {
  if (isPlaying) {
    return "Playing";
  }
  if (isLastStep) {
    return "Complete";
  }
  return "Paused";
}

/** Model/synthesis progress appended to the playback label while voice runs. */
function narrationStatusSuffix(voiceStatus: VoiceManagerStatus): string {
  if (voiceStatus.kind === "loading-model") {
    return ` · narration model ${voiceStatus.percent}%`;
  }
  if (voiceStatus.kind === "synthesizing") {
    return " · narrating…";
  }
  return "";
}

// The narration state machine spans several effects; splitting it further
// scattered related state without making any piece simpler.
// oxlint-disable-next-line complexity
export function GuidedExplanationPlayer(props: {
  content: GuidedExplanationLessonContent;
  completed: boolean;
  courseId: string;
  lessonId: string;
  nextLessonId: string | null;
  nextLessonTitle: string | null;
  onGoToLesson: (lessonId: string | null) => void;
}): ReactElement {
  const { steps } = props.content;
  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [stepProgress, setStepProgress] = useState(0);
  const prefersReducedMotion = useReducedMotion();
  // Direction of the last step change: the stage slides with the narration.
  // The comparison must happen during render — the transition variants need
  // the direction in the same commit the step changes, before any effect runs.
  const previousStepIndexRef = useRef(stepIndex);
  // oxlint-disable-next-line react/refs
  const stepDirection = stepIndex >= previousStepIndexRef.current ? 1 : -1;
  useEffect(() => {
    previousStepIndexRef.current = stepIndex;
  }, [stepIndex]);

  // Narration: preferences arrive from the manager (localStorage-backed),
  // and sentence audio is synthesized per active sentence and cached.
  const [voicePreferences, setVoicePreferences] =
    useState<VoicePreferences>(readVoicePreferences);
  const [voiceStatus, setVoiceStatus] = useState<VoiceManagerStatus>({
    kind: "idle",
  });
  useEffect(
    () =>
      subscribeToVoicePreferences(() => {
        setVoicePreferences(readVoicePreferences());
      }),
    []
  );
  useEffect(() => subscribeToVoiceStatus(setVoiceStatus), []);
  // Voice failures were previously silent (console-only): surface them so a
  // model-download/runtime error is visible instead of "no audio, no signs".
  const lastVoiceErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      voicePreferences.enabled &&
      voiceStatus.kind === "voice-failed" &&
      lastVoiceErrorRef.current !== voiceStatus.message
    ) {
      lastVoiceErrorRef.current = voiceStatus.message;
      toast.error(`Narration unavailable: ${voiceStatus.message}`);
    }
    if (voiceStatus.kind === "idle" || voiceStatus.kind === "synthesizing") {
      lastVoiceErrorRef.current = null;
    }
  }, [voiceStatus, voicePreferences.enabled]);

  // One sentence's narration channel + which sentence the voice is on.
  const narrationChannelRef = useRef<NarrationChannel | null>(null);
  const [narratedSentenceIndex, setNarratedSentenceIndex] = useState<
    number | null
  >(null);
  // How many of this lesson's sentences have stored audio — shown as
  // "N/M lines" next to Playing/Paused. Re-probed as steps advance and when
  // background sweeps finish writing lines (cache subscription).
  const [voiceLineCounts, setVoiceLineCounts] = useState<number | null>(null);
  const cacheGeneration = useRef(0);
  // Global sentence index -> synthesized audio duration (diagnostics + the
  // prefetch's skip guard).
  const sentenceDurationsRef = useRef<Map<number, number>>(new Map());
  // Generation counter for the narration loop: bumped on every cancel so a
  // superseded loop's async steps abort instead of speaking over the new one.
  const narrationGenerationRef = useRef(0);

  const getNarrationChannel = useCallback((): NarrationChannel => {
    if (narrationChannelRef.current === null) {
      narrationChannelRef.current = createNarrationChannel();
    }
    return narrationChannelRef.current;
  }, []);

  const stopActiveNarration = useCallback(
    (reason: string): void => {
      narrationLog("stop narration:", reason);
      getNarrationChannel().stop();
    },
    [getNarrationChannel]
  );

  // Restart the explanation when a different guided lesson is opened.
  useEffect(() => {
    narrationLog("lesson changed -> restart at step 0");
    // oxlint-disable-next-line react/set-state-in-effect -- resetting the playback state machine on lesson change is the point of this effect
    setStepIndex(0);
    setStepProgress(0);
    setIsPlaying(true);
    setNarratedSentenceIndex(null);
    stopActiveNarration("lesson restarted");
    sentenceDurationsRef.current = new Map();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- lessonId exists to trigger the restart; it is never read inside
  }, [props.lessonId, stopActiveNarration]);

  const isLastStep = stepIndex === steps.length - 1;

  // Global index of each step's first sentence (the narration loop and the
  // seek handler translate step indexes into transcript line indexes).
  const stepSentenceOffsets = useMemo(() => {
    const offsets: number[] = [];
    let offset = 0;
    for (const step of steps) {
      offsets.push(offset);
      offset += narrationSentences(step.narration).length;
    }
    return offsets;
  }, [steps]);

  const goToStep = useCallback(
    (nextStepIndex: number): void => {
      const boundedIndex = Math.max(
        0,
        Math.min(nextStepIndex, steps.length - 1)
      );
      if (boundedIndex !== stepIndex) {
        playInteractionCue("select", {
          direction: boundedIndex > stepIndex ? "forward" : "back",
          emphasis: "subtle",
        });
      }
      narrationLog("go to step", boundedIndex);
      stopActiveNarration("step seek");
      setNarratedSentenceIndex(stepSentenceOffsets[boundedIndex] ?? null);
      setStepIndex(boundedIndex);
      setStepProgress(0);
    },
    [stepIndex, steps.length, stepSentenceOffsets, stopActiveNarration]
  );

  // Keyboard: space toggles playback, arrows step (institute-style).
  useEffect(() => {
    function handleKeyDown(keyboardEvent: KeyboardEvent): void {
      const eventTarget = keyboardEvent.target;
      if (
        eventTarget instanceof HTMLElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(eventTarget.tagName)
      ) {
        return;
      }
      if (keyboardEvent.code === "Space") {
        keyboardEvent.preventDefault();
        narrationLog("spacebar ->", isPlaying ? "pausing" : "playing");
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
  }, [goToStep, isPlaying, stepIndex]);

  // Transcript: the narration reads as one continuous paragraph; the sentence
  // currently being narrated lights up. Sentences are flattened step by step
  // so the lit index tracks playback across step boundaries.
  const transcriptSentences = useMemo(() => {
    const sentences: { stepIndex: number; text: string }[] = [];
    for (const [stepRefIndex, step] of steps.entries()) {
      for (const sentence of narrationSentences(step.narration)) {
        sentences.push({ stepIndex: stepRefIndex, text: sentence });
      }
    }
    return sentences;
  }, [steps]);
  const transcriptSentenceCount = transcriptSentences.length;

  // "N/M lines ready": count this lesson's sentences with cached audio and
  // refresh on cache writes (playback misses, background sweeps) so the
  // status stays truthful while narration lines generate.
  useEffect(() => {
    if (!voicePreferences.enabled) {
      // oxlint-disable-next-line react/set-state-in-effect -- a disabled voice must reset the cached-line counter
      setVoiceLineCounts(null);
      return;
    }
    cacheGeneration.current += 1;
    const generation = cacheGeneration.current;
    const totalLines = transcriptSentences.length;
    void (async () => {
      const cachedCount = await countCachedUtterances(
        transcriptSentences.map((sentence) => sentence.text),
        voicePreferences
      );
      if (cacheGeneration.current === generation) {
        narrationLog(`voice lines ready: ${cachedCount}/${totalLines}`);
        setVoiceLineCounts(cachedCount);
      }
    })();
    return subscribeToVoiceCacheWrites(() => {
      cacheGeneration.current += 1;
      const latestGeneration = cacheGeneration.current;
      void (async () => {
        const cachedCount = await countCachedUtterances(
          transcriptSentences.map((sentence) => sentence.text),
          voicePreferences
        );
        if (cacheGeneration.current === latestGeneration) {
          setVoiceLineCounts(cachedCount);
        }
      })();
    });
  }, [transcriptSentences, voicePreferences]);

  // rAF-driven step clock: drives the per-step progress bar and advances to
  // the next step when the current step's duration elapses. Only used when
  // narration is OFF — with the voice on, the audio-driven loop below owns
  // pacing (the estimate clock would cut sentences off mid-word).
  useEffect(() => {
    if (!isPlaying || voicePreferences.enabled) {
      return;
    }
    // oxlint-disable-next-line react/set-state-in-effect -- each step restarts its progress bar from zero on the step change
    setStepProgress(0);
    const stepDurationMs = guidedStepDurationMs(steps[stepIndex]);
    const startedAt = performance.now();
    let rafId = 0;
    const tick = (): void => {
      const percent = Math.min(
        ((performance.now() - startedAt) / stepDurationMs) * 100,
        100
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
  }, [isPlaying, stepIndex, isLastStep, steps, voicePreferences.enabled]);

  const stepSentenceCount = Math.max(
    1,
    narrationSentences(steps[stepIndex]?.narration ?? "").length
  );
  // With the voice on, the narration loop owns the lit sentence (it lights
  // each line as the voice reaches it); without it, the estimate clock does.
  const activeSentenceIndex =
    voicePreferences.enabled && narratedSentenceIndex !== null
      ? Math.min(narratedSentenceIndex, transcriptSentences.length - 1)
      : Math.min(
          stepSentenceOffsets[stepIndex] +
            Math.floor((stepProgress / 100) * stepSentenceCount),
          transcriptSentences.length - 1
        );

  // Audio-driven narration loop: with the voice on, each step's lines are
  // synthesized (cache-first) and spoken IN FULL, one at a time — the step
  // advances when its last line ends. This replaces the estimate clock, which
  // cut sentences off mid-word whenever the text-length estimate ran faster
  // than real audio. Pausing/seeking/lesson changes cancel the loop; resuming
  // restarts the current step from its first line.
  useEffect(() => {
    if (!isPlaying || !voicePreferences.enabled) {
      stopActiveNarration(isPlaying ? "voice disabled" : "paused");
      return;
    }
    narrationGenerationRef.current += 1;
    const generation = narrationGenerationRef.current;
    const isCancelled = (): boolean =>
      generation !== narrationGenerationRef.current;
    const stepSentences = narrationSentences(steps[stepIndex]?.narration ?? "");
    void (async () => {
      await speakStepLines({
        firstSentenceIndex: stepSentenceOffsets[stepIndex] ?? 0,
        isCancelled,
        onProgress: (percent) => {
          if (!isCancelled()) {
            setStepProgress(percent);
          }
        },
        onSentenceLit: (globalSentenceIndex) => {
          setNarratedSentenceIndex(globalSentenceIndex);
        },
        onUtteranceReady: (globalSentenceIndex, durationMs) => {
          sentenceDurationsRef.current.set(globalSentenceIndex, durationMs);
        },
        play: (utterance) =>
          getNarrationChannel().play(utterance.cacheKey, utterance.wav),
        sentences: stepSentences,
        speakFallbackMs:
          guidedStepDurationMs(steps[stepIndex]) /
          Math.max(stepSentences.length, 1),
        synthesize: (text) => getOrSynthesizeUtterance(text, voicePreferences),
      });
      if (isCancelled()) {
        return;
      }
      setStepProgress(100);
      if (stepIndex < steps.length - 1) {
        narrationLog("step complete -> next step");
        // Institute-style animation sound: a soft blip marks the transition.
        playInteractionCue("navigate", { emphasis: "subtle" });
        setStepIndex(stepIndex + 1);
      } else {
        narrationLog("lesson narration finished");
        setIsPlaying(false);
      }
    })();
    return () => {
      narrationGenerationRef.current += 1;
      stopActiveNarration("narration loop restarted");
    };
  }, [
    isPlaying,
    voicePreferences,
    stepIndex,
    stepSentenceOffsets,
    steps,
    stopActiveNarration,
    getNarrationChannel,
  ]);

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
    const modules: TranscriptModule[] = [];
    let moduleStartStep = 0;
    let moduleCharacters = 0;
    for (const [stepIdx, step] of steps.entries()) {
      moduleCharacters += step.narration.length;
      if (moduleCharacters >= 900 && stepIdx + 1 < steps.length) {
        modules.push({ endStep: stepIdx + 1, startStep: moduleStartStep });
        moduleStartStep = stepIdx + 1;
        moduleCharacters = 0;
      }
    }
    modules.push({ endStep: steps.length, startStep: moduleStartStep });
    return modules;
  }, [steps]);
  const activeModule =
    transcriptModules.find(
      (module) => stepIndex >= module.startStep && stepIndex < module.endStep
    ) ?? transcriptModules[0];
  const activeModuleIndex = transcriptModules.indexOf(activeModule);

  // Module-ahead voice prefetch: fill the cache for the sub-lesson module the
  // reader is on, plus exactly one module ahead — crossing a boundary never
  // waits on the WASM engine, and nothing beyond that is generated. Cache
  // hits resolve instantly; the narration loop shares the in-flight promises,
  // so playback rides this synthesis instead of racing it.
  useEffect(() => {
    if (!voicePreferences.enabled) {
      return;
    }
    let cancelled = false;
    const sentencesForModule = (module: TranscriptModule): string[] =>
      transcriptSentences
        .filter(
          (sentence) =>
            sentence.stepIndex >= module.startStep &&
            sentence.stepIndex < module.endStep
        )
        .map((sentence) => sentence.text);
    const nextModule = transcriptModules[activeModuleIndex + 1];
    const moduleQueue: string[] = [
      ...sentencesForModule(activeModule),
      ...(nextModule === undefined ? [] : sentencesForModule(nextModule)),
    ];
    void (async () => {
      for (const sentenceText of moduleQueue) {
        if (cancelled) {
          return;
        }
        // Sequential on purpose: synthesis is the same queued engine the
        // narration loop rides, so order matters and parallel calls would
        // thrash the cache queue.
        // oxlint-disable-next-line no-await-in-loop
        await getOrSynthesizeUtterance(sentenceText, voicePreferences);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    activeModule,
    activeModuleIndex,
    transcriptModules,
    transcriptSentences,
    voicePreferences,
  ]);
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: 0 });
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- activeModuleIndex exists to lash the scroll reset to module changes
  }, [activeModuleIndex]);

  const transcript = (
    <aside className="border-border/70 w-full shrink-0 border-b lg:h-full lg:w-[360px] lg:border-r lg:border-b-0">
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
                  <button
                    aria-current={isActive || undefined}
                    className={`${transcriptSentenceClass(isPast, isActive)} inline`}
                    data-transcript-sentence={sentenceRefIndex}
                    // Prose segments stay out of tab order on purpose:
                    // arrow keys already seek steps.
                    onClick={() => {
                      goToStep(sentence.stepIndex);
                    }}
                    onKeyDown={(sentenceClickEvent) => {
                      if (
                        sentenceClickEvent.key === "Enter" ||
                        sentenceClickEvent.key === " "
                      ) {
                        sentenceClickEvent.preventDefault();
                        goToStep(sentence.stepIndex);
                      }
                    }}
                    tabIndex={-1}
                    type="button"
                  >
                    {sentence.text}
                  </button>{" "}
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
                className="bg-background text-muted-foreground hover:text-foreground hover:border-ring disabled:hover:text-muted-foreground flex size-7 items-center justify-center rounded-full border transition-colors disabled:opacity-40"
                disabled={activeModuleIndex === 0}
                onClick={() => {
                  goToStep(transcriptModules[activeModuleIndex - 1].startStep);
                }}
                type="button"
              >
                <ArrowLeftIcon aria-hidden="true" className="size-3.5" />
              </button>
              <button
                aria-label="Next sub-lesson"
                className="bg-background text-muted-foreground hover:text-foreground hover:border-ring disabled:hover:text-muted-foreground flex size-7 items-center justify-center rounded-full border transition-colors disabled:opacity-40"
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
              className="text-muted-foreground mt-2 mb-4 text-sm leading-relaxed"
              style={
                {
                  animationDelay: "60ms",
                } as CSSProperties
              }
            >
              <MessageResponse>{props.content.intro}</MessageResponse>
            </div>
          )}

          <AnimatePresence custom={stepDirection} initial={false} mode="wait">
            <motion.div
              animate="center"
              className="bg-card rounded-xl border"
              custom={stepDirection}
              exit="exit"
              initial="enter"
              key={stepIndex}
              variants={
                prefersReducedMotion ? reducedStageVariants : stageVariants
              }
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
            </motion.div>
          </AnimatePresence>
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
                narrationLog(
                  "play button clicked ->",
                  isPlaying ? "pausing" : "playing"
                );
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
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs tabular-nums">
              {isPlaying && voicePreferences.enabled ? (
                <span aria-hidden="true" className="relative flex size-2">
                  <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
                  <span className="bg-primary relative inline-flex size-2 rounded-full" />
                </span>
              ) : null}
              {playbackStatusLabel(isPlaying, isLastStep)} · {stepIndex + 1}/
              {steps.length}
              {voicePreferences.enabled ? (
                <>
                  {narrationStatusSuffix(voiceStatus)}
                  {voiceLineCounts === null
                    ? ""
                    : ` · ${voiceLineCounts}/${transcriptSentenceCount} lines`}
                </>
              ) : null}
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
