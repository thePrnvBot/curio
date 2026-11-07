/**
 * Interaction-independent narration voice preferences and the persistent
 * utterance cache. Utterances are keyed by (provider, voice, speed, sha256 of
 * the sentence text), so a sentence synthesized once replays instantly on
 * every revisit - across reloads - for free.
 */

import { Effect } from "effect";

export type VoiceProviderId = "kokoro-web-v2";

export interface VoicePreferences {
  readonly enabled: boolean;
  readonly speed: number;
  readonly voiceId: string;
}

const VOICE_PREFERENCES_KEY = "curio-voice-preferences";

/** Defaults are conservative: narration is OFF until the learner opts in. */
export const DEFAULT_VOICE_PREFERENCES: VoicePreferences = {
  enabled: false,
  speed: 1,
  voiceId: "af_heart",
};

export function readVoicePreferences(): VoicePreferences {
  if (typeof window === "undefined") {
    return DEFAULT_VOICE_PREFERENCES;
  }
  const rawJson = window.localStorage.getItem(VOICE_PREFERENCES_KEY);
  if (rawJson === null) {
    return DEFAULT_VOICE_PREFERENCES;
  }
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (typeof parsed !== "object" || parsed === null) {
      return DEFAULT_VOICE_PREFERENCES;
    }
    const candidate = parsed as Partial<VoicePreferences> | null;
    return {
      enabled: candidate?.enabled === true,
      speed:
        typeof candidate?.speed === "number" && candidate.speed > 0
          ? candidate.speed
          : DEFAULT_VOICE_PREFERENCES.speed,
      voiceId:
        typeof candidate?.voiceId === "string" && candidate.voiceId !== ""
          ? candidate.voiceId
          : DEFAULT_VOICE_PREFERENCES.voiceId,
    };
  } catch {
    return DEFAULT_VOICE_PREFERENCES;
  }
}

export function saveVoicePreferences(preferences: VoicePreferences): void {
  window.localStorage.setItem(
    VOICE_PREFERENCES_KEY,
    JSON.stringify(preferences)
  );
  for (const listener of preferenceListeners) {
    listener();
  }
}

const preferenceListeners = new Set<() => void>();

export function subscribeToVoicePreferences(
  listener: () => void
): () => void {
  preferenceListeners.add(listener);
  return () => {
    preferenceListeners.delete(listener);
  };
}

/* -------------------------- utterance cache (IndexedDB) -------------------------- */

export interface CachedUtterance {
  readonly createdAt: number;
  readonly durationMs: number;
  readonly key: string;
  readonly sampleRate: number;
  readonly textHash: string;
  /** 16-bit PCM WAV bytes. */
  readonly wav: ArrayBuffer;
}

export class VoiceCacheFailed extends Error {
  readonly _tag = "VoiceCacheFailed";

  constructor(params: { message: string }) {
    super(params.message);
    this.name = "VoiceCacheFailed";
  }
}

const CACHE_DB_NAME = "curio-voice";
const CACHE_STORE_NAME = "utterances";
const CACHE_MAX_ENTRIES = 500;

function openVoiceCache(): Effect.Effect<IDBDatabase, VoiceCacheFailed> {
  return Effect.callback((resume) => {
    const request = indexedDB.open(CACHE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CACHE_STORE_NAME)) {
        database.createObjectStore(CACHE_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onerror = () => {
      resume(
        Effect.fail(
          new VoiceCacheFailed({
            message: request.error?.message ?? "failed to open cache",
          })
        )
      );
    };
    request.onsuccess = () => {
      resume(Effect.succeed(request.result));
    };
  });
}

/** IndexedDB requests are wrapped so failures surface as typed cache errors
 * while successes keep the original request-inferred value types. */
function cacheRequest<T>(request: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => {
      reject(
        new VoiceCacheFailed({
          message: request.error?.message ?? "cache request failed",
        })
      );
    };
    request.onsuccess = () => {
      resolve(request.result as T);
    };
  });
}

function cacheTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.onabort = () => {
      reject(
        new VoiceCacheFailed({
          message: transaction.error?.message ?? "cache operation aborted",
        })
      );
    };
    transaction.onerror = () => {
      reject(
        new VoiceCacheFailed({
          message: transaction.error?.message ?? "cache operation failed",
        })
      );
    };
    transaction.oncomplete = () => {
      resolve();
    };
  });
}

/** Stable cache key: provider + voice + speed + sentence content hash. */
export async function utteranceCacheKey(
  providerId: string,
  text: string,
  preferences: { readonly speed: number; readonly voiceId: string }
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const { speed, voiceId } = preferences;
  return `${providerId}:${voiceId}:${speed}:${hash}`;
}

/** Returns the cached WAV for a key, or null on a miss. */
export function readCachedUtterance(
  key: string
): Effect.Effect<CachedUtterance | null, VoiceCacheFailed> {
  return Effect.gen(function* readUtterance() {
    const database = yield* openVoiceCache();
    try {
      const transaction = database.transaction(CACHE_STORE_NAME, "readonly");
      const record = yield* Effect.tryPromise({
        catch: (cause) =>
          cause instanceof VoiceCacheFailed
            ? cause
            : new VoiceCacheFailed({
                message: cause instanceof Error ? cause.message : "cache read failed",
              }),
        try: () =>
          cacheRequest<CachedUtterance | undefined>(
            transaction.objectStore(CACHE_STORE_NAME).get(key)
          ),
      });
      return record ?? null;
    } finally {
      database.close();
    }
  });
}

export function writeCachedUtterance(
  record: CachedUtterance
): Effect.Effect<void, VoiceCacheFailed> {
  return Effect.gen(function* writeUtterance() {
    const database = yield* openVoiceCache();
    try {
      const transaction = database.transaction(CACHE_STORE_NAME, "readwrite");
      transaction.objectStore(CACHE_STORE_NAME).put(record);
      yield* Effect.tryPromise({
        catch: (cause) =>
          cause instanceof VoiceCacheFailed
            ? cause
            : new VoiceCacheFailed({
                message:
                  cause instanceof Error ? cause.message : "cache write failed",
              }),
        try: () => cacheTransaction(transaction),
      });
      // Soft cap: drop the oldest records beyond the limit so months of
      // lessons don't grow the database without bound.
      const transactionCount = yield* Effect.tryPromise({
        catch: (cause) =>
          cause instanceof VoiceCacheFailed
            ? cause
            : new VoiceCacheFailed({
                message:
                  cause instanceof Error ? cause.message : "cache count failed",
              }),
        try: () =>
          cacheRequest<number>(
            database.transaction(CACHE_STORE_NAME, "readonly")
              .objectStore(CACHE_STORE_NAME)
              .count()
          ),
      });
      if (transactionCount > CACHE_MAX_ENTRIES) {
        const pruneTransaction = database.transaction(
          CACHE_STORE_NAME,
          "readwrite"
        );
        const pruneStore = pruneTransaction.objectStore(CACHE_STORE_NAME);
        yield* Effect.tryPromise({
          catch: (cause) =>
            cause instanceof VoiceCacheFailed
              ? cause
              : new VoiceCacheFailed({
                  message:
                    cause instanceof Error ? cause.message : "cache prune failed",
                }),
          try: () => {
            let staleDeleted = 0;
            return new Promise<void>((resolve, reject) => {
              const cursorRequest = pruneStore.openCursor();
              cursorRequest.onsuccess = () => {
                const cursor = cursorRequest.result;
                if (cursor === null) {
                  void cacheTransaction(pruneTransaction)
                    .then(resolve, reject);
                  return;
                }
                const candidate = cursor.value as CachedUtterance | undefined;
                if (
                  candidate !== undefined &&
                  candidate.key !== record.key &&
                  candidate.createdAt < record.createdAt
                ) {
                  void cursor.delete();
                  staleDeleted += 1;
                }
                if (staleDeleted > transactionCount - CACHE_MAX_ENTRIES) {
                  void cacheTransaction(pruneTransaction)
                    .then(resolve, reject);
                  return;
                }
                void cursor.continue();
              };
              cursorRequest.onerror = () => {
                reject(
                  new VoiceCacheFailed({
                    message:
                      cursorRequest.error?.message ?? "cache prune failed",
                  })
                );
              };
            });
          },
        });
      }
    } finally {
      database.close();
    }
  });
}
