/// <reference lib="webworker" />
import { KokoroTTS } from "kokoro-js";
import type { GenerateOptions } from "kokoro-js";

import { narrationLog } from "./voice-playback";
import type {
  VoiceWorkerRequest,
  VoiceWorkerResponse,
} from "./voice-worker-protocol";

/**
 * Kokoro-82M narration synth, loaded lazily inside a worker so the model
 * download and inference never block the UI thread. Each sentence is rendered
 * to 16-bit PCM WAV on demand; results are postMessage'd back with the
 * request id.
 */

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

/** Maximum positive amplitude a signed 16-bit PCM sample can carry. */
const PCM16_MAX_AMPLITUDE = 32_767;

let modelPromise: Promise<KokoroTTS> | null = null;

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

function loadModel(): Promise<KokoroTTS> {
  if (modelPromise === null) {
    narrationLog("loading Kokoro model (wasm q8)");
    const pendingLoad = KokoroTTS.from_pretrained(MODEL_ID, {
      // WebGPU + fp32 renders garbled noise with kokoro's graph on several
      // browsers (the waveform comes back full of static), so synthesis
      // always runs the WASM q8 path. Slower per sentence; clean audio.
      dtype: "q8",
      // Model download size is significant (~80MB q8): stream progress back so
      // the UI can show a "downloading narration model" state.
      progress_callback: (progress: { progress?: number; status?: string }) => {
        if (
          progress.status === "progress" &&
          typeof progress.progress === "number"
        ) {
          postModelProgress(progress.progress);
        }
      },
    });
    modelPromise = pendingLoad;
    void (async () => {
      try {
        await pendingLoad;
      } catch (loadError: unknown) {
        // A failed load must NOT be cached: the rejected promise used to
        // stick around forever, so one WebGPU/runtime hiccup silenced
        // narration until a full reload. Reset so the next sentence retries
        // (and can fall back).
        modelPromise = null;
        throw loadError;
      }
    })();
  }
  return modelPromise;
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
  view.setUint32(16, 16, true);
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

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

// oxlint-disable-next-line unicorn/prefer-add-event-listener -- the worker owns exactly one message protocol; the on* handler states that single-subscriber intent
workerScope.onmessage = async (event: MessageEvent<VoiceWorkerRequest>) => {
  const request = event.data;
  if (request.type !== "synthesize") {
    return;
  }
  try {
    const tts = await loadModel();
    const audio = await tts.generate(request.text, {
      speed: request.speed,
      voice: resolveKokoroVoice(tts, request.voiceId),
    });
    const samples = audio.audio;
    // Sample statistics: sane speech floats sit within ±1 with a moderate RMS;
    // garbage (wrong device/dtype) shows extreme or saturated values.
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let squaredSum = 0;
    const probeLength = Math.min(samples.length, 24_000);
    for (let sampleIndex = 0; sampleIndex < probeLength; sampleIndex += 1) {
      const value = samples[sampleIndex];
      min = Math.min(min, value);
      max = Math.max(max, value);
      squaredSum += value * value;
    }
    narrationLog(
      "worker samples:",
      samples.constructor.name,
      `len=${samples.length}`,
      `min=${min.toFixed(3)}`,
      `max=${max.toFixed(3)}`,
      `rms=${Math.sqrt(squaredSum / Math.max(probeLength, 1)).toFixed(3)}`
    );
    const wav = encodeWavPcm16(samples, audio.sampling_rate);
    const response: VoiceWorkerResponse = {
      durationMs: (audio.audio.length / audio.sampling_rate) * 1000,
      id: request.id,
      ok: true,
      sampleRate: audio.sampling_rate,
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
