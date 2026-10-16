/**
 * Provider-agnostic narration voice abstraction, so the guided explanation
 * player never knows which engine renders the voice lines. The first
 * implementation is Kokoro-82M in a dedicated web worker; later providers
 * (Piper, Chatterbox, Web Speech, or a server TTS tier) implement the same
 * three functions and are swapped via the preference's provider id.
 */

import { Effect } from "effect";

import type {
  VoicePreferences,
} from "./voice-cache";
import {
  readCachedUtterance,
  utteranceCacheKey,
  writeCachedUtterance,
} from "./voice-cache";
import { narrationLog } from "./voice-playback";
import { KOKORO_VOICE_CATALOG } from "./voice-catalog";
import type {
  VoiceCatalogEntry,
  VoiceWorkerRequest,
  VoiceWorkerResponse,
} from "./voice-worker-protocol";

export type { VoicePreferences } from "./voice-cache";
export type { VoiceCatalogEntry } from "./voice-worker-protocol";

export class VoiceSynthesisFailed extends Error {
  readonly _tag = "VoiceSynthesisFailed";

  constructor(params: { message: string }) {
    super(params.message);
    this.name = "VoiceSynthesisFailed";
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
  synthesize(
    text: string,
    preferences: { readonly speed: number; readonly voiceId: string }
  ): Effect.Effect<SynthesizedUtterance, VoiceSynthesisFailed>;
  /** Voice list; must not require model weights. */
  listVoices(): Promise<readonly VoiceCatalogEntry[]>;
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
    new URL("./kokoro-voice.worker.ts", import.meta.url),
    { type: "module" }
  );
  worker.onmessage = (event: MessageEvent<VoiceWorkerResponse>) => {
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
          new VoiceSynthesisFailed({
            message: response.message ?? "Kokoro speech failed",
          })
        );
      }
    }
  };
  worker.onerror = (errorEvent: ErrorEvent) => {
    const failure = new VoiceSynthesisFailed({
      message: errorEvent.message || "voice worker crashed",
    });
    // The worker is dead — drop it so the next synthesis spins up a fresh
    // worker instead of posting into a void (which would hang forever).
    try {
      worker.terminate();
    } catch {
      worker.postMessage === undefined; // noop guard
    }
    workerInstance = null;
    setStatus({ kind: "voice-failed", message: failure.message });
    for (const pending of pendingRequests.values()) {
      pending.reject(failure);
    }
    pendingRequests.clear();
  };
  workerInstance = worker;
  return worker;
}

function postVoiceRequest(
  request: VoiceWorkerRequest
): Promise<VoiceWorkerResponse> {
  const worker = ensureWorker();
  return new Promise((resolve, reject) => {
    if (request.type === "synthesize") {
      pendingRequests.set(request.id, { reject, resolve });
    }
    try {
      worker.postMessage(request);
    } catch (error: unknown) {
      if (request.type === "synthesize") {
        pendingRequests.delete(request.id);
      }
      reject(
        new VoiceSynthesisFailed({
          message: error instanceof Error ? error.message : "worker post failed",
        })
      );
    }
  });
}

/* -------------------------------- provider --------------------------------- */

// The v2 suffix orphans every cached utterance synthesized by the old
// WebGPU engine, whose waveforms were garbled noise.
export const KOKORO_WEB_PROVIDER_ID = "kokoro-web-v2";

export const kokoroWebVoiceProvider: VoiceProvider = {
  async listVoices(): Promise<readonly VoiceCatalogEntry[]> {
    // The catalog is static published metadata - no worker round-trip
    // needed, so the picker renders instantly without waking the engine.
    return KOKORO_VOICE_CATALOG;
  },

  providerId: KOKORO_WEB_PROVIDER_ID,

  synthesize: (text, preferences) =>
    Effect.callback((resume) => {
      void postVoiceRequest({
        id: nextRequestId++,
        speed: preferences.speed,
        text,
        type: "synthesize",
        voiceId: preferences.voiceId,
      })
        .then((response) => {
          if (response.type !== "synthesis" || response.ok === false) {
            resume(
              Effect.fail(
                new VoiceSynthesisFailed({
                  message:
                    response.type === "synthesis"
                      ? response.message
                      : "synthesis returned no audio",
                })
              )
            );
            return;
          }
          resume(
            Effect.succeed({
              providerId: KOKORO_WEB_PROVIDER_ID,
              wav: response.wav,
              durationMs: response.durationMs,
              sampleRate: response.sampleRate,
            })
          );
        })
        .catch((error: unknown) => {
          resume(
            Effect.fail(
              new VoiceSynthesisFailed({
                message:
                  error instanceof Error ? error.message : "speech failed",
              })
            )
          );
        });
    }),
};

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

export function subscribeToVoiceStatus(
  listener: (status: VoiceManagerStatus) => void
): () => void {
  statusListeners.add(listener);
  listener(currentStatus);
  return () => {
    statusListeners.delete(listener);
  };
}

const activeProvider = kokoroWebVoiceProvider;

export async function getVoiceCatalog(): Promise<readonly VoiceCatalogEntry[]> {
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

export function countCachedUtterances(
  texts: readonly string[],
  preferences: VoicePreferences
): Promise<number> {
  if (!preferences.enabled) {
    return Promise.resolve(0);
  }
  return (async () => {
    let cachedCount = 0;
    for (const text of texts) {
      if (await hasCachedUtterance(text, preferences)) {
        cachedCount += 1;
      }
    }
    return cachedCount;
  })();
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
    const synthesis = synthesizeUncached(key, text, preferences).finally(
      () => {
        inFlightUtterances.delete(key);
      }
    );
    inFlightUtterances.set(key, synthesis);
    return synthesis;
  })();
  return request;
}

async function synthesizeUncached(
  key: string,
  text: string,
  preferences: VoicePreferences
): Promise<VoiceUtterance | null> {
  const cached = await Effect.runPromise(
    Effect.catch(readCachedUtterance(key), (cacheError) =>
      Effect.gen(function* () {
        console.warn("Voice cache unavailable", cacheError.message);
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
    void Effect.runPromise(
      writeCachedUtterance({
        createdAt: Date.now(),
        durationMs: utterance.durationMs,
        key,
        sampleRate: utterance.sampleRate,
        textHash,
        wav: utterance.wav,
      })
    )
      .then(() => {
        bumpCacheWriteVersion();
      })
      .catch((cacheWriteError: unknown) => {
        console.warn(
          "Voice cache write failed",
          cacheWriteError instanceof Error ? cacheWriteError.message : cacheWriteError
        );
      });
    setStatus({ kind: "idle" });
    return { ...utterance, cacheKey: key };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "speech synthesis failed";
    setStatus({ kind: "voice-failed", message });
    console.warn("Voice synthesis failed:", message);
    return null;
  }
}
