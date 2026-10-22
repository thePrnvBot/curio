import type { VoiceUtterance } from "@/utils/voice/voice-manager";
import { narrationLog } from "@/utils/voice/voice-playback";

import { NARRATION_SENTENCE_GAP_MS, sleep } from "./guided-explanation-timing";

export interface SpeakStepOptions {
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
export async function speakStepLines(options: SpeakStepOptions): Promise<void> {
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
