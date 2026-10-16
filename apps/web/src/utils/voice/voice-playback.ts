/**
 * Narration playback through the Web Audio API.
 *
 * The first implementation played each line with `new Audio(...).play()`.
 * Browser autoplay policies reject that call outside a user gesture — Safari
 * requires it in the gesture's call stack, and a page loaded directly into a
 * lesson has no gesture at all — and the rejection was swallowed, so the
 * "N/M lines generated" counter kept counting while not a single line was
 * audible. An AudioContext unlocked by any earlier pointer/key interaction
 * (the same mechanism the interaction cues rely on) keeps its permission for
 * the page lifetime, so narration plays whenever the learner has touched the
 * page at all.
 */

let playbackContext: AudioContext | null = null;
let unlockBound = false;

function getPlaybackContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (playbackContext === null) {
    const ContextConstructor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (ContextConstructor === undefined) {
      return null;
    }
    playbackContext = new ContextConstructor();
  }
  return playbackContext;
}

/** Resume the context on the first interaction; bound once per page. */
function ensureUnlockBinding(): void {
  if (unlockBound || typeof window === "undefined") {
    return;
  }
  unlockBound = true;
  const unlock = (): void => {
    const context = getPlaybackContext();
    if (context !== null && context.state === "suspended") {
      void context.resume().catch(() => {});
    }
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
}

export interface NarrationChannel {
  /** Speaks one utterance, replacing whatever the channel was speaking. */
  play(cacheKey: string, wav: ArrayBuffer): void;
  /** Silence the channel and invalidate in-flight decodes. */
  stop(): void;
}

/** Decoded audio per utterance cache key, so revisits skip re-decoding. */
const MAX_DECODED_BUFFERS = 300;
const decodedBuffers = new Map<string, AudioBuffer>();

export function createNarrationChannel(): NarrationChannel {
  ensureUnlockBinding();
  let epoch = 0;
  let currentSource: AudioBufferSourceNode | null = null;

  const stopCurrentSource = (): void => {
    if (currentSource !== null) {
      try {
        currentSource.stop();
      } catch {
        // Already stopped; stopping twice throws.
      }
      currentSource.disconnect();
      currentSource = null;
    }
  };

  return {
    play(cacheKey, wav) {
      epoch += 1;
      const playEpoch = epoch;
      stopCurrentSource();
      const context = getPlaybackContext();
      if (context === null) {
        return;
      }
      if (context.state === "suspended") {
        void context.resume().catch(() => {});
      }
      void (async () => {
        let buffer = decodedBuffers.get(cacheKey);
        if (buffer === undefined) {
          try {
            // decodeAudioData detaches the buffer it is given; always hand
            // it a copy so the caller's (cache-backed) source stays intact.
            buffer = await context.decodeAudioData(wav.slice(0));
          } catch {
            return;
          }
          decodedBuffers.set(cacheKey, buffer);
          while (decodedBuffers.size > MAX_DECODED_BUFFERS) {
            const oldestKey = decodedBuffers.keys().next().value;
            if (oldestKey === undefined) {
              break;
            }
            decodedBuffers.delete(oldestKey);
          }
        }
        if (epoch !== playEpoch) {
          // A newer line (or stop) superseded this one while decoding.
          return;
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        currentSource = source;
        source.start();
      })();
    },
    stop() {
      epoch += 1;
      stopCurrentSource();
    },
  };
}
