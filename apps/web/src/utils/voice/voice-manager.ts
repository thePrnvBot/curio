/**
 * Provider-agnostic narration voice abstraction, so the guided explanation
 * player never knows which engine renders the voice lines. The first
 * implementation is Kokoro-82M in a dedicated web worker; later providers
 * (Piper, Chatterbox, Web Speech, or a server TTS tier) implement the same
 * three functions and are swapped via the preference's provider id.
 */

import { Effect } from "effect";

import type { VoicePreferences } from "./voice-cache";
import {
  readCachedUtterance,
  utteranceCacheKey,
  writeCachedUtterance,
} from "./voice-cache";
import { KOKORO_VOICE_CATALOG } from "./voice-catalog";
import { logger } from "../logger";
import { narrationLog } from "./voice-playback";
import type {
  VoiceCatalogEntry,
  VoiceWorkerRequest,
  VoiceWorkerResponse,
} from "./voice-worker-protocol";

export type { VoicePreferences } from "./voice-cache";
export type { VoiceCatalogEntry } from "./voice-worker-protocol";

export class VoiceSynthesisFailedError extends Error {
  readonly _tag = "VoiceSynthesisFailedError";

  constructor(params: { message: string }) {
    super(params.message);
    this.name = "VoiceSynthesisFailedError";
  }
}

export interface VoiceUtterance {
  /** Stable cache key (provider:voice:speed:hash) - also the playback
   * decode-cache key. Attached by the manager, not the provider. */
  readonly cacheKey: string;
  /** Narrated length in milliseconds (single WAV, per sentence). */
  readonly durationMs: number;
  readonly providerId: string;
  readonly sampleRate: number;
  readonly wav: ArrayBuffer;
}

/** What a provider renders; the manager attaches the cache key. */
export type SynthesizedUtterance = Omit<VoiceUtterance, "cacheKey">;

export interface VoiceProvider {
  readonly providerId: string;
  /** Lazily initialized; may download model weights on first call. */
  readonly synthesize: (
    text: string,
    preferences: { readonly speed: number; readonly voiceId: string }
  ) => Effect.Effect<SynthesizedUtterance, VoiceSynthesisFailedError>;
  /** Voice list; must not require model weights. */
  readonly listVoices: () => Promise<readonly VoiceCatalogEntry[]>;
}

/* --------------------------------- manager --------------------------------- */

export {
  readVoicePreferences,
  saveVoicePreferences,
  subscribeToVoicePreferences,
} from "./voice-cache";

export type VoiceManagerStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "loading-model"; readonly percent: number }
  | { readonly kind: "synthesizing" }
  | { readonly kind: "voice-failed"; readonly message: string };

let currentStatus: VoiceManagerStatus = { kind: "idle" };
const statusListeners = new Set<(status: VoiceManagerStatus) => void>();

function setStatus(nextStatus: VoiceManagerStatus): void {
  currentStatus = nextStatus;
  for (const listener of statusListeners) {
    listener(nextStatus);
  }
}

export function subscribeToVoiceStatus(
  listener: (status: VoiceManagerStatus) => void
): () => void {
  statusListeners.add(listener);
  listener(currentStatus);
  return () => {
    statusListeners.delete(listener);
  };
}

/* ------------------------------ worker plumbing ------------------------------ */

let workerInstance: Worker | null = null;
let nextRequestId = 1;

const progressListeners = new Set<(percent: number) => void>();
const pendingRequests = new Map<
  number,
  {
    reject: (error: Error) => void;
    resolve: (receiver: VoiceWorkerResponse) => void;
  }
>();

function ensureWorker(): Worker {
  if (workerInstance !== null) {
    return workerInstance;
  }
  const worker = new Worker(
    new URL("kokoro-voice.worker.ts", import.meta.url),
    { type: "module" }
  );
  worker.addEventListener(
    "message",
    (event: MessageEvent<VoiceWorkerResponse>) => {
      const response = event.data;
      if (response.type === "model-progress") {
        for (const listener of progressListeners) {
          listener(response.percent);
        }
        return;
      }
      if (response.type === "synthesis") {
        const pendingRequest = pendingRequests.get(response.id);
        if (pendingRequest === undefined) {
          return;
        }
        pendingRequests.delete(response.id);
        if (response.ok) {
          pendingRequest.resolve(response);
        } else {
          pendingRequest.reject(
            new VoiceSynthesisFailedError({
              message: response.message ?? "Kokoro speech failed",
            })
          );
        }
      }
    }
  );
  worker.addEventListener("error", (errorEvent: ErrorEvent) => {
    const failure = new VoiceSynthesisFailedError({
      message: errorEvent.message || "voice worker crashed",
    });
    // The worker is dead — drop it so the next synthesis spins up a fresh
    // worker instead of posting into a void (which would hang forever).
    try {
      worker.terminate();
    } catch {
      // noop guard
    }
    workerInstance = null;
    setStatus({ kind: "voice-failed", message: failure.message });
    for (const pending of pendingRequests.values()) {
      pending.reject(failure);
    }
    pendingRequests.clear();
  });
  workerInstance = worker;
  return worker;
}

function postSynthesizeRequest(
  request: VoiceWorkerRequest & { type: "synthesize" }
): Effect.Effect<VoiceWorkerResponse, VoiceSynthesisFailedError> {
  return Effect.callback<VoiceWorkerResponse, VoiceSynthesisFailedError>(
    (resume) => {
      const worker = ensureWorker();
      pendingRequests.set(request.id, {
        reject: (error) =>
          resume(
            Effect.fail(
              error instanceof VoiceSynthesisFailedError
                ? error
                : new VoiceSynthesisFailedError({
                    message:
                      error instanceof Error
                        ? error.message
                        : "speech failed",
                  })
            )
          ),
        resolve: (response) => resume(Effect.succeed(response)),
      });
    try {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      worker.postMessage(request);
    } catch (error: unknown) {
      pendingRequests.delete(request.id);
      resume(
        Effect.fail(
          new VoiceSynthesisFailedError({
            message:
              error instanceof Error ? error.message : "worker post failed",
          })
        )
      );
    }
  });
}

/* -------------------------------- provider --------------------------------- */

// The v2 suffix orphans every cached utterance synthesized by the old
// WebGPU engine, whose waveforms were garbled noise.
export const KOKORO_WEB_PROVIDER_ID = "kokoro-web-v2";

export const kokoroWebVoiceProvider: VoiceProvider = {
  listVoices(): Promise<readonly VoiceCatalogEntry[]> {
    // The catalog is static published metadata - no worker round-trip
    // needed, so the picker renders instantly without waking the engine.
    return Promise.resolve(KOKORO_VOICE_CATALOG);
  },

  providerId: KOKORO_WEB_PROVIDER_ID,

  synthesize: (text, preferences) =>
    Effect.gen(function* synthesizeVoice() {
      const requestId = nextRequestId;
      nextRequestId += 1;
      const response = yield* postSynthesizeRequest({
        id: requestId,
        speed: preferences.speed,
        text,
        type: "synthesize",
        voiceId: preferences.voiceId,
      });
      if (response.type !== "synthesis" || response.ok === false) {
        return yield* Effect.fail(
          new VoiceSynthesisFailedError({
            message:
              response.type === "synthesis"
                ? response.message
                : "synthesis returned no audio",
          })
        );
      }
      return {
        providerId: KOKORO_WEB_PROVIDER_ID,
        wav: response.wav,
        durationMs: response.durationMs,
        sampleRate: response.sampleRate,
      };
    }),
};

/** Renames model download events into the shared status stream so the UI
 * reads a "narration model 63%" state instead of a silent pause. */
function wireModelProgress(): void {
  progressListeners.add((percent) => {
    currentStatus = { kind: "loading-model", percent };
    for (const listener of statusListeners) {
      listener(currentStatus);
    }
  });
}
wireModelProgress();

const activeProvider = kokoroWebVoiceProvider;

export function getVoiceCatalog(): Promise<readonly VoiceCatalogEntry[]> {
  return activeProvider.listVoices();
}

export function subscribeToModelProgress(
  listener: (percent: number) => void
): () => void {
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
}

/** Cache probe without any worker involvement: true when the sentence is
 * already stored, used by background sweeps to skip cheap work. */
export async function hasCachedUtterance(
  text: string,
  preferences: VoicePreferences
): Promise<boolean> {
  if (!preferences.enabled) {
    return false;
  }
  try {
    const key = await utteranceCacheKey(activeProvider.providerId, text, {
      speed: preferences.speed,
      voiceId: preferences.voiceId,
    });
    const cached = await Effect.runPromise(
      // oxlint-disable-next-line promise/valid-params
      Effect.catch(readCachedUtterance(key), () => Effect.succeed(null))
    );
    return cached !== null;
  } catch {
    return false;
  }
}

/**
 * Cache-first sentence synthesis: an IndexedDB hit replays instantly; a miss
 * synthesizes through the provider and persists for every revisit. In-flight
 * calls are deduplicated by key so the per-step playback, course-wide
 * background sweep and user seeking share one synthesis instead of racing.
 */
const inFlightUtterances = new Map<string, Promise<VoiceUtterance | null>>();

/* ---------------------- generation progress visibility ---------------------- */

let cacheWriteVersion = 0;
const cacheWriteListeners = new Set<() => void>();

function bumpCacheWriteVersion(): void {
  cacheWriteVersion += 1;
  for (const listener of cacheWriteListeners) {
    listener();
  }
}

/** Fires on every fresh utterance persisted (player, background sweep, etc.),
 * so UI can show how many voice lines exist. */
export function subscribeToVoiceCacheWrites(
  listener: () => void
): () => void {
  cacheWriteListeners.add(listener);
  return () => {
    cacheWriteListeners.delete(listener);
  };
}

export async function countCachedUtterances(
  texts: readonly string[],
  preferences: VoicePreferences
): Promise<number> {
  if (!preferences.enabled) {
    return 0;
  }
  const results = await Promise.all(
    texts.map((text) => hasCachedUtterance(text, preferences))
  );
  return results.filter(Boolean).length;
}

async function synthesizeUncached(
  key: string,
  text: string,
  preferences: VoicePreferences
): Promise<VoiceUtterance | null> {
  const cached = await Effect.runPromise(
    // oxlint-disable-next-line promise/valid-params
    Effect.catch(readCachedUtterance(key), (cacheError) =>
      Effect.sync(() => {
        logger.warn("Voice cache unavailable", cacheError.message);
        return null;
      })
    )
  );
  if (cached !== null) {
    narrationLog(
      "cache hit:",
      key.slice(0, 40),
      `bytes=${cached.wav.byteLength}`,
      `durationMs=${cached.durationMs}`
    );
    return {
      cacheKey: key,
      durationMs: cached.durationMs,
      providerId: activeProvider.providerId,
      sampleRate: cached.sampleRate,
      wav: cached.wav,
    };
  }

  narrationLog(
    "cache miss, synthesizing:",
    key.slice(0, 40),
    JSON.stringify(text.slice(0, 60))
  );
  setStatus({ kind: "synthesizing" });
  try {
    const utterance = await Effect.runPromise(
      activeProvider.synthesize(text, {
        speed: preferences.speed,
        voiceId: preferences.voiceId,
      })
    );
    narrationLog(
      "synthesized:",
      `bytes=${utterance.wav.byteLength}`,
      `durationMs=${utterance.durationMs}`,
      `sampleRate=${utterance.sampleRate}`
    );
    const textHash = key.split(":").at(-1) ?? "";
    void (async () => {
      try {
        await Effect.runPromise(
          writeCachedUtterance({
            createdAt: Date.now(),
            durationMs: utterance.durationMs,
            key,
            sampleRate: utterance.sampleRate,
            textHash,
            wav: utterance.wav,
          })
        );
        bumpCacheWriteVersion();
      } catch (cacheWriteError: unknown) {
        console.warn(
          "Voice cache write failed",
          cacheWriteError instanceof Error
            ? cacheWriteError.message
            : cacheWriteError
        );
      }
    })();
    setStatus({ kind: "idle" });
    return { ...utterance, cacheKey: key };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "speech synthesis failed";
    setStatus({ kind: "voice-failed", message });
    logger.warn("Voice synthesis failed:", message);
    return null;
  }
}

export function getOrSynthesizeUtterance(
  text: string,
  preferences: VoicePreferences
): Promise<VoiceUtterance | null> {
  if (!preferences.enabled) {
    return Promise.resolve(null);
  }
  const request = (async () => {
    const key = await utteranceCacheKey(activeProvider.providerId, text, {
      speed: preferences.speed,
      voiceId: preferences.voiceId,
    });
    const pending = inFlightUtterances.get(key);
    if (pending !== undefined) {
      return pending;
    }
    const synthesis = (async () => {
      try {
        return await synthesizeUncached(key, text, preferences);
      } finally {
        inFlightUtterances.delete(key);
      }
    })();
    inFlightUtterances.set(key, synthesis);
    return synthesis;
  })();
  return request;
}
