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
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import { toast } from "sonner";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react";

import { highlightCode } from "@curio/ui/components/ai-elements/code-block";
import { playInteractionCue } from "@/utils/sound";
import {
  createNarrationChannel,
  narrationLog,
  type NarrationChannel,
} from "@/utils/voice/voice-playback";
import {
  countCachedUtterances,
  getOrSynthesizeUtterance,
  readVoicePreferences,
  subscribeToVoiceCacheWrites,
  subscribeToVoicePreferences,
  subscribeToVoiceStatus,
  type VoiceManagerStatus,
  type VoicePreferences,
  type VoiceUtterance,
} from "@/utils/voice/voice-manager";

import { LessonCompletionControls } from "./lesson-completion-controls";

/** Breath between sentence audio takes so stitched lines don't collide. */
const NARRATION_SENTENCE_GAP_MS = 260;

const sleep = (ms: number): Promise<void> =>
  // oxlint-disable-next-line promise/avoid-new
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

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
export function narrationSentences(narration: string): string[] {
  return narration
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/** Effect-Institute-style stage transitions: the incoming visual slides up
 * from the narration direction with a blur-fade, the outgoing one lifts away.
 * Mirrored when stepping backwards. */
const stageVariants: Variants = {
  enter: (direction: number) => ({
    opacity: 0,
    y: 26 * direction,
    filter: "blur(6px)",
  }),
  center: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] },
  },
  exit: (direction: number) => ({
    opacity: 0,
    y: -20 * direction,
    filter: "blur(4px)",
    transition: { duration: 0.22, ease: [0.4, 0, 1, 1] },
  }),
};

/** Reduced motion: crossfade only, no travel. */
const reducedStageVariants: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

interface SpeakStepOptions {
  readonly firstSentenceIndex: number;
  readonly isCancelled: () => boolean;
  readonly onProgress: (percent: number) => void;
  readonly onSentenceLit: (globalSentenceIndex: number) => void;
  readonly onUtteranceReady: (
    globalSentenceIndex: number,
    durationMs: number
  ) => void;
  readonly play: (utterance: VoiceUtterance) => Promise<void>;
  readonly sentences: readonly string[];
  readonly speakFallbackMs: number;
  readonly synthesize: (text: string) => Promise<VoiceUtterance | null>;
}

/** Speaks one step's lines in order, in full; resolves when the step's last
 * line ends (or immediately once cancelled). Lines are synthesized one at a
 * time, so a first pass may pause briefly per line while the engine renders —
 * each line is cached afterwards and replays instantly. */
// oxlint-disable-next-line promise(avoid-new) -- none used; annotation anchor
async function speakStepLines(options: SpeakStepOptions): Promise<void> {
  const progress = { completedLines: 0 };
  const totalLines = Math.max(options.sentences.length, 1);
  for (let index = 0; index < options.sentences.length; index += 1) {
    if (options.isCancelled()) {
      return;
    }
    const globalSentenceIndex = options.firstSentenceIndex + index;
    options.onSentenceLit(globalSentenceIndex);
    // Lines are spoken in order; parallelizing would overlap the voices.
    // oxlint-disable-next-line no-await-in-loop
    const utterance = await options.synthesize(options.sentences[index] ?? "");
    if (options.isCancelled()) {
      return;
    }
    if (utterance !== null) {
      options.onUtteranceReady(globalSentenceIndex, utterance.durationMs);
    }
    const spokenMs = utterance?.durationMs ?? options.speakFallbackMs;
    const sentenceStartedAt = performance.now();
    let rafId = requestAnimationFrame(function tick() {
      if (options.isCancelled()) {
        return;
      }
      const lineFraction = Math.min(
        (performance.now() - sentenceStartedAt) / spokenMs,
        1
      );
      options.onProgress(
        ((progress.completedLines + lineFraction) / totalLines) * 100
      );
      rafId = requestAnimationFrame(tick);
    });
    if (utterance === null) {
      narrationLog(
        `sentence ${globalSentenceIndex + 1}: synthesis failed, holding estimated window`
      );
      // oxlint-disable-next-line no-await-in-loop
      await sleep(spokenMs);
    } else {
      narrationLog(
        `speaking sentence ${globalSentenceIndex + 1}:`,
        `bytes=${utterance.wav.byteLength}`,
        `durationMs=${utterance.durationMs}`
      );
      // oxlint-disable-next-line no-await-in-loop
      await options.play(utterance);
    }
    cancelAnimationFrame(rafId);
    if (options.isCancelled()) {
      return;
    }
    progress.completedLines += 1;
    options.onProgress((progress.completedLines / totalLines) * 100);
    // oxlint-disable-next-line no-await-in-loop
    await sleep(NARRATION_SENTENCE_GAP_MS);
  }
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
  const steps = props.content.steps;
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
    setStepIndex(0);
    setStepProgress(0);
    setIsPlaying(true);
    setNarratedSentenceIndex(null);
    stopActiveNarration("lesson restarted");
    sentenceDurationsRef.current = new Map();
  }, [props.lessonId]);

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

  function goToStep(nextStepIndex: number): void {
    const boundedIndex = Math.max(0, Math.min(nextStepIndex, steps.length - 1));
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
  }

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
        narrationLog(
          "spacebar ->",
          isPlaying ? "pausing" : "playing"
        );
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
  }, [isPlaying, stepIndex, steps.length]);

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
  const transcriptSentenceCount = transcriptSentences.length;

  // "N/M lines ready": count this lesson's sentences with cached audio and
  // refresh on cache writes (playback misses, background sweeps) so the
  // status stays truthful while narration lines generate.
  useEffect(() => {
    let generation = ++cacheGeneration.current;
    const totalLines = transcriptSentences.length;
    if (!voicePreferences.enabled) {
      setVoiceLineCounts(null);
      return;
    }
    void countCachedUtterances(
      transcriptSentences.map((sentence) => sentence.text),
      voicePreferences
    ).then((cachedCount) => {
      if (cacheGeneration.current === generation) {
        narrationLog(`voice lines ready: ${cachedCount}/${totalLines}`);
        setVoiceLineCounts(cachedCount);
      }
    });
    return subscribeToVoiceCacheWrites(() => {
      const latestGeneration = ++cacheGeneration.current;
      void countCachedUtterances(
        transcriptSentences.map((sentence) => sentence.text),
        voicePreferences
      ).then((cachedCount) => {
        if (cacheGeneration.current === latestGeneration) {
          setVoiceLineCounts(cachedCount);
        }
      });
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

  // Prefetch: once a step starts (or narration is enabled), synthesize (or
  // pull from cache) every sentence of it, oldest first, so its audio exists
  // before the clock reaches each line.
  useEffect(() => {
    if (!voicePreferences.enabled) {
      stopActiveNarration("voice disabled (prefetch)");
      return;
    }
    let cancelled = false;
    const stepSentenceIndexes: number[] = [];
    const stepSentenceTexts: string[] = [];
    narrationSentences(steps[stepIndex]?.narration ?? "").forEach(
      (sentence, sentenceOffset) => {
        stepSentenceIndexes.push(stepSentenceOffsets[stepIndex] + sentenceOffset);
        stepSentenceTexts.push(sentence);
      }
    );
    void (async () => {
      for (
        let stepSentenceIndex = 0;
        stepSentenceIndex < stepSentenceIndexes.length;
        stepSentenceIndex += 1
      ) {
        if (cancelled) {
          return;
        }
        const globalSentenceIndex = stepSentenceIndexes[stepSentenceIndex] ?? -1;
        if (sentenceDurationsRef.current.has(globalSentenceIndex)) {
          continue;
        }
        const utterance = await getOrSynthesizeUtterance(
          stepSentenceTexts[stepSentenceIndex] ?? "",
          voicePreferences
        );
        if (cancelled || utterance === null) {
          continue;
        }
        sentenceDurationsRef.current.set(
          globalSentenceIndex,
          utterance.durationMs
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stepIndex, stepSentenceOffsets, steps, voicePreferences]);

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
    const generation = ++narrationGenerationRef.current;
    const isCancelled = (): boolean =>
      generation !== narrationGenerationRef.current;
    const stepSentences = narrationSentences(
      steps[stepIndex]?.narration ?? ""
    );
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
  }, [isPlaying, voicePreferences, stepIndex, stepSentenceOffsets, steps, stopActiveNarration, getNarrationChannel]);


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

          <AnimatePresence
            custom={stepDirection}
            initial={false}
            mode="wait"
          >
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
              {isPlaying ? "Playing" : isLastStep ? "Complete" : "Paused"} ·{" "}
              {stepIndex + 1}/{steps.length}
              {voicePreferences.enabled ? (
                <>
                  {voiceStatus.kind === "loading-model"
                    ? ` · narration model ${voiceStatus.percent}%`
                    : voiceStatus.kind === "synthesizing"
                      ? " · narrating…"
                      : ""}
                  {voiceLineCounts !== null
                    ? ` · ${voiceLineCounts}/${transcriptSentenceCount} lines`
                    : ""}
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


