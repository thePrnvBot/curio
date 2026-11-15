/**
 * Interaction-independent narration voice preferences and the persistent
 * utterance cache. Utterances are keyed by (provider, voice, speed, sha256 of
 * the sentence text), so a sentence synthesized once replays instantly on
 * every revisit - across reloads - for free.
 */

import { Effect } from "effect";

export type VoiceProviderId = "kokoro-web-v2";

/** How the narration engine picks its compute device. WebGPU has no portable
 * way to address a device by name, so `auto` / `high-performance` / `low-power`
 * are the only GPU selectors and `wasm` forces the CPU engine. */
export type VoiceGpuPreference =
  | "auto"
  | "high-performance"
  | "low-power"
  | "wasm";

export const VOICE_GPU_PREFERENCES: readonly VoiceGpuPreference[] = [
  "auto",
  "high-performance",
  "low-power",
  "wasm",
];

export interface VoicePreferences {
  readonly enabled: boolean;
  readonly gpuPreference: VoiceGpuPreference;
  readonly speed: number;
  readonly voiceId: string;
}

const VOICE_PREFERENCES_KEY = "curio-voice-preferences";

/** Defaults are conservative: narration is OFF until the learner opts in.
 * High performance preserves the previous behaviour of steering WebGPU to a
 * discrete adapter when the machine has one. */
export const DEFAULT_VOICE_PREFERENCES: VoicePreferences = {
  enabled: false,
  gpuPreference: "high-performance",
  speed: 1,
  voiceId: "af_heart",
};

/** Persisted values are untrusted: anything outside the closed set falls back
 * to the default instead of reaching `requestAdapter`. */
export function normalizeVoiceGpuPreference(
  value: unknown
): VoiceGpuPreference {
  return typeof value === "string" &&
    (VOICE_GPU_PREFERENCES as readonly string[]).includes(value)
    ? (value as VoiceGpuPreference)
    : DEFAULT_VOICE_PREFERENCES.gpuPreference;
}

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
      gpuPreference: normalizeVoiceGpuPreference(candidate?.gpuPreference),
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

const preferenceListeners = new Set<() => void>();

export function saveVoicePreferences(preferences: VoicePreferences): void {
  window.localStorage.setItem(
    VOICE_PREFERENCES_KEY,
    JSON.stringify(preferences)
  );
  for (const listener of preferenceListeners) {
    listener();
  }
}

export function subscribeToVoicePreferences(listener: () => void): () => void {
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

export class VoiceCacheFailedError extends Error {
  readonly _tag = "VoiceCacheFailedError";

  constructor(params: { message: string }) {
    super(params.message);
    this.name = "VoiceCacheFailedError";
  }
}

const CACHE_DB_NAME = "curio-voice";
const CACHE_STORE_NAME = "utterances";
const CACHE_MAX_ENTRIES = 500;

/**
 * One long-lived connection per page. Opening and closing IndexedDB for every
 * read/write used to cost two connections per synthesized line, which made
 * whole-lesson prefills contend with the main thread for no reason.
 */
let cachedDatabase: IDBDatabase | null = null;
let cachedDatabasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (cachedDatabase !== null) {
    return Promise.resolve(cachedDatabase);
  }
  if (cachedDatabasePromise !== null) {
    return cachedDatabasePromise;
  }
  // oxlint-disable-next-line promise/avoid-new -- IndexedDB is callback-based; wrapping the request is the only bridge
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB_NAME, 1);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CACHE_STORE_NAME)) {
        database.createObjectStore(CACHE_STORE_NAME, { keyPath: "key" });
      }
    });
    request.addEventListener("error", () => {
      reject(
        new VoiceCacheFailedError({
          message: request.error?.message ?? "failed to open cache",
        })
      );
    });
    request.addEventListener("success", () => {
      const database = request.result;
      cachedDatabase = database;
      // Another tab upgrading the schema invalidates this handle; drop it so
      // the next call reopens instead of throwing on a closed connection.
      database.addEventListener("versionchange", () => {
        database.close();
        cachedDatabase = null;
        cachedDatabasePromise = null;
      });
      resolve(database);
    });
  });
  cachedDatabasePromise = pending;
  void (async () => {
    try {
      await pending;
    } catch {
      // A failed open must not stay memoised: the next call retries.
      cachedDatabasePromise = null;
    }
  })();
  return pending;
}

function openVoiceCache(): Effect.Effect<IDBDatabase, VoiceCacheFailedError> {
  return Effect.tryPromise({
    catch: (cause) =>
      cause instanceof VoiceCacheFailedError
        ? cause
        : new VoiceCacheFailedError({
            message:
              cause instanceof Error ? cause.message : "failed to open cache",
          }),
    try: openDatabase,
  });
}

/** IndexedDB requests are wrapped so failures surface as typed cache errors
 * while successes keep the original request-inferred value types. */
function cacheRequest<T>(request: IDBRequest): Promise<T> {
  return Effect.runPromise(
    Effect.callback<T, VoiceCacheFailedError>((resume) => {
      request.addEventListener(
        "error",
        () => {
          resume(
            Effect.fail(
              new VoiceCacheFailedError({
                message: request.error?.message ?? "cache request failed",
              })
            )
          );
        },
        { once: true }
      );
      request.addEventListener(
        "success",
        () => {
          resume(Effect.succeed(request.result as T));
        },
        { once: true }
      );
    })
  );
}

function cacheTransaction(transaction: IDBTransaction): Promise<void> {
  return Effect.runPromise(
    // oxlint-disable-next-line typescript/no-invalid-void-type
    Effect.callback<void, VoiceCacheFailedError>((resume) => {
      transaction.addEventListener(
        "abort",
        () => {
          resume(
            Effect.fail(
              new VoiceCacheFailedError({
                message:
                  transaction.error?.message ?? "cache operation aborted",
              })
            )
          );
        },
        { once: true }
      );
      transaction.addEventListener(
        "error",
        () => {
          resume(
            Effect.fail(
              new VoiceCacheFailedError({
                message: transaction.error?.message ?? "cache operation failed",
              })
            )
          );
        },
        { once: true }
      );
      transaction.addEventListener(
        "complete",
        () => {
          resume(Effect.void);
        },
        { once: true }
      );
    })
  );
}

/** Stable cache key: provider + voice + speed + sentence content hash. */
const MAX_MEMOIZED_CACHE_KEYS = 2000;
const cacheKeyMemo = new Map<string, Promise<string>>();

async function computeUtteranceCacheKey(
  providerId: string,
  text: string,
  preferences: { readonly speed: number; readonly voiceId: string }
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const { speed, voiceId } = preferences;
  return `${providerId}:${voiceId}:${speed}:${hash}`;
}

/**
 * Hashing the same sentence repeatedly is pure waste: a whole-lesson prefill
 * probes every line several times (playback, prefetch, counters). Results are
 * memoised per (provider, voice, speed, text) and the promise is shared so
 * concurrent callers do not compute the same digest twice.
 */
export function utteranceCacheKey(
  providerId: string,
  text: string,
  preferences: { readonly speed: number; readonly voiceId: string }
): Promise<string> {
  const memoKey = `${providerId}\u0000${preferences.voiceId}\u0000${preferences.speed}\u0000${text}`;
  const memoized = cacheKeyMemo.get(memoKey);
  if (memoized !== undefined) {
    return memoized;
  }
  const computed = computeUtteranceCacheKey(providerId, text, preferences);
  cacheKeyMemo.set(memoKey, computed);
  if (cacheKeyMemo.size > MAX_MEMOIZED_CACHE_KEYS) {
    const oldestKey = cacheKeyMemo.keys().next().value;
    if (oldestKey !== undefined) {
      cacheKeyMemo.delete(oldestKey);
    }
  }
  // A failed digest must not stay memoised as a permanently rejected promise.
  void (async () => {
    try {
      await computed;
    } catch {
      cacheKeyMemo.delete(memoKey);
    }
  })();
  return computed;
}

/** Returns the cached WAV for a key, or null on a miss. */
export function readCachedUtterance(
  key: string
): Effect.Effect<CachedUtterance | null, VoiceCacheFailedError> {
  return Effect.gen(function* readUtterance() {
    const database = yield* openVoiceCache();
    const transaction = database.transaction(CACHE_STORE_NAME, "readonly");
    const record = yield* Effect.tryPromise({
      catch: (cause) =>
        cause instanceof VoiceCacheFailedError
          ? cause
          : new VoiceCacheFailedError({
              message:
                cause instanceof Error ? cause.message : "cache read failed",
            }),
      try: () =>
        cacheRequest<CachedUtterance | undefined>(
          transaction.objectStore(CACHE_STORE_NAME).get(key)
        ),
    });
    return record ?? null;
  });
}

/**
 * Batch cache probe used by the "N/M lines ready" counter and prefetch guards:
 * one transaction + `getAllKeys()` instead of one database round-trip per
 * sentence.
 */
export function readCachedUtteranceKeys(
  keys: readonly string[]
): Effect.Effect<ReadonlySet<string>, VoiceCacheFailedError> {
  if (keys.length === 0) {
    return Effect.succeed(new Set<string>());
  }
  return Effect.gen(function* readUtteranceKeys() {
    const database = yield* openVoiceCache();
    const storedKeys = yield* Effect.tryPromise({
      catch: (cause) =>
        cause instanceof VoiceCacheFailedError
          ? cause
          : new VoiceCacheFailedError({
              message:
                cause instanceof Error ? cause.message : "cache keys failed",
            }),
      try: () =>
        cacheRequest<IDBValidKey[]>(
          database
            .transaction(CACHE_STORE_NAME, "readonly")
            .objectStore(CACHE_STORE_NAME)
            .getAllKeys()
        ),
    });
    const wanted = new Set(keys);
    return new Set(
      storedKeys.filter(
        (storedKey): storedKey is string =>
          typeof storedKey === "string" && wanted.has(storedKey)
      )
    );
  });
}

export function writeCachedUtterance(
  record: CachedUtterance
): Effect.Effect<void, VoiceCacheFailedError> {
  return Effect.gen(function* writeUtterance() {
    const database = yield* openVoiceCache();
    const transaction = database.transaction(CACHE_STORE_NAME, "readwrite");
    transaction.objectStore(CACHE_STORE_NAME).put(record);
    yield* Effect.tryPromise({
      catch: (cause) =>
        cause instanceof VoiceCacheFailedError
          ? cause
          : new VoiceCacheFailedError({
              message:
                cause instanceof Error ? cause.message : "cache write failed",
            }),
      try: () => cacheTransaction(transaction),
    });
    // Soft cap: drop the oldest records beyond the limit so months of
    // lessons don't grow the database without bound.
    const transactionCount = yield* Effect.tryPromise({
      catch: (cause) =>
        cause instanceof VoiceCacheFailedError
          ? cause
          : new VoiceCacheFailedError({
              message:
                cause instanceof Error ? cause.message : "cache count failed",
            }),
      try: () =>
        cacheRequest<number>(
          database
            .transaction(CACHE_STORE_NAME, "readonly")
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
          cause instanceof VoiceCacheFailedError
            ? cause
            : new VoiceCacheFailedError({
                message:
                  cause instanceof Error ? cause.message : "cache prune failed",
              }),
        try: async () => {
          let staleDeleted = 0;
          // IndexedDB cursor iteration is callback-based; wrapping it in a
          // promise is the only way to await completion.
          // oxlint-disable-next-line promise/avoid-new
          await new Promise<void>((resolve, reject) => {
            const cursorRequest = pruneStore.openCursor();
            const finish = async (onComplete: () => void): Promise<void> => {
              try {
                await cacheTransaction(pruneTransaction);
                onComplete();
              } catch (error: unknown) {
                reject(
                  error instanceof VoiceCacheFailedError
                    ? error
                    : new VoiceCacheFailedError({
                        message:
                          error instanceof Error
                            ? error.message
                            : "cache prune failed",
                      })
                );
              }
            };
            cursorRequest.addEventListener("success", () => {
              const cursor = cursorRequest.result;
              if (cursor === null) {
                void finish(resolve);
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
                void finish(resolve);
                return;
              }
              cursor.continue();
            });
            cursorRequest.addEventListener(
              "error",
              () => {
                reject(
                  new VoiceCacheFailedError({
                    message:
                      cursorRequest.error?.message ?? "cache prune failed",
                  })
                );
              },
              { once: true }
            );
          });
        },
      });
    }
  });
}
