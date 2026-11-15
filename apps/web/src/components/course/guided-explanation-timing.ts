import type { GuidedExplanationStep } from "@curio/api/domain/course";

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

/**
 * Kokoro tokenizes with `truncation: true` at 512 tokens, so anything longer
 * than this is silently dropped mid-sentence. A generous cap keeps normal
 * prose intact while guaranteeing a pathological run-on still gets spoken in
 * full.
 */
export const MAX_NARRATION_SENTENCE_CHARS = 600;

/** Splits an over-long sentence on clause boundaries, then words, so no single
 * synthesis request can hit Kokoro's truncation limit. */
function splitLongSentence(sentence: string): string[] {
  if (sentence.length <= MAX_NARRATION_SENTENCE_CHARS) {
    return [sentence];
  }
  const chunks: string[] = [];
  let remaining = sentence;
  while (remaining.length > MAX_NARRATION_SENTENCE_CHARS) {
    const window = remaining.slice(0, MAX_NARRATION_SENTENCE_CHARS + 1);
    const clauseBreak = Math.max(
      window.lastIndexOf(", "),
      window.lastIndexOf("; "),
      window.lastIndexOf(": ")
    );
    const cut = clauseBreak > 0 ? clauseBreak + 1 : window.lastIndexOf(" ");
    if (cut <= 0) {
      // No usable break (a 600-character unbroken token); leave it whole and
      // let the engine truncate rather than loop forever.
      break;
    }
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining !== "") {
    chunks.push(remaining);
  }
  return chunks;
}

/** Sentence segmentation for the transcript: the active sentence lights up
 * while its step narrates, so the prose reads as one flowing paragraph. */
export function narrationSentences(narration: string): string[] {
  return narration
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
    .flatMap(splitLongSentence);
}
