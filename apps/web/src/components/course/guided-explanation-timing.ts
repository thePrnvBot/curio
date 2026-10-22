import type { GuidedExplanationStep } from "@curio/db/schema/course";

/** Breath between sentence audio takes so stitched lines don't collide. */
export const NARRATION_SENTENCE_GAP_MS = 260;

export const sleep = (ms: number): Promise<void> =>
  // oxlint-disable-next-line promise/avoid-new
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Narrated, step-sequenced explanation player: transcript on the left,
 * synced visuals on the right, timer-driven playback (no voice yet). */
export function guidedStepDurationMs(step: GuidedExplanationStep): number {
  if (step.durationMs !== undefined) {
    return step.durationMs;
  }
  const wordCount = step.narration.trim().split(/\s+/u).length;
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
