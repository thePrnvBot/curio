/// <reference lib="webworker" />
import { KokoroTTS } from "kokoro-js";
import type { GenerateOptions } from "kokoro-js";

import { narrationLog } from "./voice-playback";
import { audioLooksLikeSpeech, probeAudioSamples } from "./voice-audio-probe";
import type {
  VoiceWorkerRequest,
  VoiceWorkerResponse,
} from "./voice-worker-protocol";

/**
 * Kokoro-82M narration synth, loaded lazily inside a worker so the model
 * download and inference never block the UI thread. Each sentence is rendered
 * to 16-bit PCM WAV on demand; results are postMessage'd back with the
 * request id.
 *
 * Device policy: WebGPU first, WASM always works. The WebGPU engine once
 * rendered full-scale static on some browsers, so the first synthesis off
 * WebGPU goes through a speech probe; any load failure or garbled output
 * blacklists WebGPU for the session and rebuilds on WASM q8, re-rendering
 * that sentence before it reaches the player.
 */

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

interface EnginePlan {
  readonly device: "webgpu" | "wasm";
  readonly dtype: "fp32" | "q8";
}

/**
 * WebGPU fp32 first (kokoro-js's documented GPU pairing); WebGPU fp16 causes
 * float overflow in kokoro's graph, so it stays off the candidate list.
 * WASM q8 is the known-clean floor for every browser.
 */
const ENGINE_PLAN: readonly EnginePlan[] = [
  { device: "webgpu", dtype: "fp32" },
  { device: "wasm", dtype: "q8" },
];

/** Maximum positive amplitude a signed 16-bit PCM sample can carry. */
const PCM16_MAX_AMPLITUDE = 32_767;

/** Per-session blacklist of plan indexes; a bad WebGPU runtime only costs one download. */
const rejectedPlanIndexes = new Set<number>();

/* -------------------------------- engine --------------------------------- */

interface LoadedEngine {
  readonly plan: EnginePlan;
  readonly tts: KokoroTTS;
}

let engineLoad: Promise<LoadedEngine> | null = null;

/* ------------------------------- model router ------------------------------- */

let progressPercent = -1;

function postModelProgress(percent: number): void {
  const rounded = Math.round(percent);
  if (rounded === progressPercent) {
    return;
  }
  progressPercent = rounded;
  postMessage({
    percent: rounded,
    type: "model-progress",
  } satisfies VoiceWorkerResponse);
}

/** Dedicated workers expose WebGPU behind navigator.gpu. */
function isWebGpuAvailable(): boolean {
  try {
    return typeof navigator !== "undefined" && navigator.gpu !== undefined;
  } catch {
    return false;
  }
}

function loadEnginePlan(plan: EnginePlan): Promise<KokoroTTS> {
  narrationLog(
    `loading Kokoro model (${plan.device} ${plan.dtype})`
  );
  const pendingLoad = KokoroTTS.from_pretrained(MODEL_ID, {
    // Model download is sizeable (~330MB fp32 on GPU, ~80MB q8 on WASM):
    // stream progress back so the UI keeps a "downloading narration model"
    // state across the potential two-attempt load path.
    progress_callback: (progress: { progress?: number; status?: string }) => {
      if (
        progress.status === "progress" &&
        typeof progress.progress === "number"
      ) {
        postModelProgress(progress.progress);
      }
    },
    device: plan.device,
    dtype: plan.dtype,
  });
  return pendingLoad;
}

/** Loads the first surviving plan; clears itself on rejection for retry. */
async function loadFirstAvailableEngine(): Promise<LoadedEngine> {
  // Sequential on purpose: attempting plans in order means the fallback
  // engine only downloads when the fast path is truly unusable.
  // oxlint-disable-next-line no-await-in-loop
  for (let planIndex = 0; planIndex < ENGINE_PLAN.length; planIndex += 1) {
    if (rejectedPlanIndexes.has(planIndex)) {
      continue;
    }
    const plan = ENGINE_PLAN[planIndex];
    if (plan.device === "webgpu" && !isWebGpuAvailable()) {
      rejectedPlanIndexes.add(planIndex);
      narrationLog("WebGPU unavailable in this worker; skipping to WASM");
      continue;
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- plan attempts are inherently sequential (the fallback engine only downloads when needed)
      const tts = await loadEnginePlan(plan);
      return { plan: { ...plan }, tts };
    } catch (loadError: unknown) {
      rejectedPlanIndexes.add(planIndex);
      narrationLog(
        `${plan.device} ${plan.dtype} engine failed:`,
        loadError instanceof Error ? loadError.message : String(loadError)
      );
    }
  }
  throw new Error("No usable Kokoro engine (all plans rejected)");
}

/** Cached with the same never-cache-a-rejection rule as before. */
function getEngine(): Promise<LoadedEngine> {
  if (engineLoad === null) {
    const pendingLoad = loadFirstAvailableEngine();
    engineLoad = pendingLoad;
    void (async () => {
      try {
        await pendingLoad;
      } catch {
        // A failed load must NOT be cached: the rejected promise used to
        // stick around forever, so one WebGPU/runtime hiccup silenced
        // narration until a full reload. Reset so the next sentence retries.
        engineLoad = null;
      }
    })();
  }
  return engineLoad;
}

/** Blacklists the current engine's plan and clears the cached engine. */
function rejectCurrentEngine(loadedEngine: LoadedEngine): void {
  const planIndex = ENGINE_PLAN.findIndex(
    (plan) =>
      plan.device === loadedEngine.plan.device &&
      plan.dtype === loadedEngine.plan.dtype
  );
  if (planIndex !== -1) {
    rejectedPlanIndexes.add(planIndex);
  }
  engineLoad = null;
}

/** Float32 samples -> 16-bit PCM mono WAV bytes. */
function encodeWavPcm16(
  samples: Float32Array,
  sampleRate: number
): ArrayBuffer {
  const sampleCount = samples.length;
  const bytesPerSample = 2;
  const dataByteLength = sampleCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  const writeString = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.codePointAt(index) ?? 0);
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataByteLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint16(16, 16, true);
  // 1 = linear PCM
  view.setUint16(20, 1, true);
  // mono channel
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataByteLength, true);

  let sampleIndex = 0;
  while (sampleIndex < sampleCount) {
    const clamped = Math.max(-1, Math.min(1, samples[sampleIndex]));
    view.setInt16(
      44 + sampleIndex * bytesPerSample,
      clamped * PCM16_MAX_AMPLITUDE,
      true
    );
    sampleIndex += 1;
  }
  return buffer;
}

/**
 * Kokoro rejects unknown voice ids, while persisted preferences carry plain
 * strings: validate against the loaded model's voice table and fall back to
 * kokoro's own default ("af_heart") on a mismatch.
 */
function resolveKokoroVoice(
  tts: KokoroTTS,
  requestedVoiceId: string
): GenerateOptions["voice"] {
  return Object.hasOwn(tts.voices, requestedVoiceId)
    ? (requestedVoiceId as GenerateOptions["voice"])
    : undefined;
}

/** Synthesizes on the given engine (already probe-verified or WASM). */
async function synthesizeOnEngine(
  loadedEngine: LoadedEngine,
  request: VoiceWorkerRequest & { type: "synthesize" }
): Promise<{ audio: Float32Array; sampleRate: number }> {
  const audio = await loadedEngine.tts.generate(request.text, {
    speed: request.speed,
    voice: resolveKokoroVoice(loadedEngine.tts, request.voiceId),
  });
  return { audio: audio.audio, sampleRate: audio.sampling_rate };
}

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

/**
 * Renders one request: WebGPU engines verify output through the speech probe
 * before the audio leaves the worker, rebuilding on WASM once per request,
 * so a broken GPU path never ships static to the player.
 */
async function renderRequest(
  request: VoiceWorkerRequest & { type: "synthesize" }
): Promise<{ audio: Float32Array; sampleRate: number }> {
  let loadedEngine = await getEngine();
  let synthesis = await synthesizeOnEngine(loadedEngine, request);

  if (
    loadedEngine.plan.device === "webgpu" &&
    !audioLooksLikeSpeech(synthesis.audio)
  ) {
    const stats = probeAudioSamples(synthesis.audio);
    narrationLog(
      "WebGPU output failed the speech probe:",
      `min=${stats.min.toFixed(3)}`,
      `max=${stats.max.toFixed(3)}`,
      `rms=${stats.rms.toFixed(3)}`,
      "rebuilding on fallback engine"
    );
    rejectCurrentEngine(loadedEngine);
    loadedEngine = await getEngine();
    synthesis = await synthesizeOnEngine(loadedEngine, request);
  }
  return synthesis;
}

// oxlint-disable-next-line unicorn/prefer-add-event-listener -- the worker owns exactly one message protocol; the on* handler states that single-subscriber intent
workerScope.onmessage = async (event: MessageEvent<VoiceWorkerRequest>) => {
  const request = event.data;
  if (request.type !== "synthesize") {
    return;
  }
  try {
    const { audio, sampleRate } = await renderRequest(request);
    const stats = probeAudioSamples(audio);
    narrationLog(
      "worker samples:",
      audio.constructor.name,
      `len=${audio.length}`,
      `min=${stats.min.toFixed(3)}`,
      `max=${stats.max.toFixed(3)}`,
      `rms=${stats.rms.toFixed(3)}`,
      `windowRms=${stats.quietestWindowRms.toFixed(
        3
      )}-${stats.loudestWindowRms.toFixed(3)}`
    );
    const wav = encodeWavPcm16(audio, sampleRate);
    const response: VoiceWorkerResponse = {
      durationMs: (audio.length / sampleRate) * 1000,
      id: request.id,
      ok: true,
      sampleRate,
      type: "synthesis",
      wav,
    };
    postMessage(response, [wav]);
  } catch (error: unknown) {
    const response: VoiceWorkerResponse = {
      id: request.id,
      message: error instanceof Error ? error.message : String(error),
      ok: false,
      type: "synthesis",
    };
    postMessage(response);
  }
};
