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

/** Diagnostic logging for the narration chain (button -> utterance -> audio).
 * Temporary scaffolding while tracking down silent playback. */
export function narrationLog(...parts: readonly unknown[]): void {
  console.info("[narration]", ...parts);
}

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
      narrationLog("no AudioContext constructor available");
      return null;
    }
    playbackContext = new ContextConstructor();
    narrationLog("audio context created, state:", playbackContext.state);
  }
  return playbackContext;
}

const unlockPlaybackContext = (): void => {
  const context = getPlaybackContext();
  if (context !== null && context.state === "suspended") {
    narrationLog("unlock gesture: resuming suspended context");
    void (async () => {
      try {
        await context.resume();
        narrationLog("unlock resume settled, state:", context.state);
      } catch (resumeError: unknown) {
        narrationLog("unlock resume failed:", resumeError);
      }
    })();
  }
};

/** Resume the context on the first interaction; bound once per page. */
function ensureUnlockBinding(): void {
  if (unlockBound || typeof window === "undefined") {
    return;
  }
  unlockBound = true;
  window.addEventListener("pointerdown", unlockPlaybackContext, {
    passive: true,
  });
  window.addEventListener("keydown", unlockPlaybackContext, { passive: true });
}

export interface NarrationChannel {
  /** Speaks one utterance, replacing whatever the channel was speaking. */
  play: (cacheKey: string, wav: ArrayBuffer) => void;
  /** Silence the channel and invalidate in-flight decodes. */
  stop: () => void;
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
      narrationLog("stopping current source");
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
      narrationLog(
        "channel play:",
        cacheKey.slice(0, 40),
        `bytes=${wav.byteLength}`,
        `ctx=${context?.state ?? "unavailable"}`,
        `epoch=${playEpoch}`
      );
      if (context === null) {
        narrationLog("channel play aborted: no AudioContext");
        return;
      }
      if (context.state === "suspended") {
        narrationLog("context suspended at play; requesting resume");
        void (async () => {
          try {
            await context.resume();
            narrationLog("play-time resume settled, state:", context.state);
          } catch (resumeError: unknown) {
            narrationLog("play-time resume failed:", resumeError);
          }
        })();
      }
      void (async () => {
        let buffer = decodedBuffers.get(cacheKey);
        if (buffer === undefined) {
          try {
            narrationLog(
              "decoding wav bytes:",
              wav.byteLength,
              "at ctx rate:",
              context.sampleRate
            );
            // decodeAudioData detaches the buffer it is given; always hand
            // it a copy so the caller's (cache-backed) source stays intact.
            const wavCopy = await new Blob([wav]).arrayBuffer();
            buffer = await context.decodeAudioData(wavCopy);
            narrationLog(
              "decode ok: duration=",
              Math.round(buffer.duration * 1000),
              "ms, channels=",
              buffer.numberOfChannels,
              "rate=",
              buffer.sampleRate
            );
          } catch (decodeError: unknown) {
            narrationLog("decode FAILED:", decodeError);
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
        } else {
          narrationLog("decode cache hit:", cacheKey.slice(0, 40));
        }
        if (epoch !== playEpoch) {
          // A newer line (or stop) superseded this one while decoding.
          narrationLog("decode finished but superseded (epoch mismatch)");
          return;
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        currentSource = source;
        source.addEventListener("ended", () => {
          narrationLog("source ended naturally:", cacheKey.slice(0, 40));
        });
        source.start();
        narrationLog(
          "source started, ctx.currentTime=",
          Math.round(context.currentTime * 100) / 100,
          "state=",
          context.state
        );
        narrationLog(
          "source started, ctx.currentTime=",
          Math.round(context.currentTime * 100) / 100,
          "state=",
          context.state
        );
      })();
    },
    stop() {
      epoch += 1;
      narrationLog("channel stop (epoch", epoch, ")");
      stopCurrentSource();
    },
  };
}
