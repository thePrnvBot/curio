/// <reference lib="webworker" />
import { KokoroTTS } from "kokoro-js";

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

let modelPromise: Promise<KokoroTTS> | null = null;

function loadModel(): Promise<KokoroTTS> {
  if (modelPromise === null) {
    modelPromise = KokoroTTS.from_pretrained(MODEL_ID, {
      // WebGPU + fp32 where available (fast, high-fidelity); q8 WASM otherwise.
      ...(("gpu" in navigator && navigator.gpu !== null
        ? { device: "webgpu" as const, dtype: "fp32" as const }
        : { dtype: "q8" as const }) as Parameters<
        typeof KokoroTTS.from_pretrained
      >[1]),
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
    // A failed load must NOT be cached: the rejected promise used to stick
    // around forever, so one WebGPU/runtime hiccup silenced narration until
    // a full reload. Reset so the next sentence retries (and can fall back).
    modelPromise.catch((loadError: unknown) => {
      modelPromise = null;
      throw loadError;
    });
  }
  return modelPromise;
}

let progressPercent = -1;

function postModelProgress(percent: number): void {
  const rounded = Math.round(percent);
  if (rounded === progressPercent) {
    return;
  }
  progressPercent = rounded;
  postMessage({ percent: rounded, type: "model-progress" } satisfies VoiceWorkerResponse);
}

/** Float32 samples -> 16-bit PCM mono WAV bytes. */
function encodeWavPcm16(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const sampleCount = samples.length;
  const bytesPerSample = 2;
  const dataByteLength = sampleCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  const writeString = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataByteLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataByteLength, true);

  let sampleIndex = 0;
  while (sampleIndex < sampleCount) {
    const clamped = Math.max(-1, Math.min(1, samples[sampleIndex]));
    view.setInt16(44 + sampleIndex * bytesPerSample, clamped * 0x7fff, true);
    sampleIndex += 1;
  }
  return buffer;
}

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = async (event: MessageEvent<VoiceWorkerRequest>) => {
  const request = event.data;
  if (request.type !== "synthesize") {
    return;
  }
  try {
    const tts = await loadModel();
    const audio = await tts.generate(request.text, {
      speed: request.speed,
      voice: request.voiceId as never,
    });
    const wav = encodeWavPcm16(audio.audio, audio.sampling_rate);
    const response: VoiceWorkerResponse = {
      durationMs: (audio.audio.length / audio.sampling_rate) * 1000,
      id: request.id,
      ok: true,
      sampleRate: audio.sampling_rate,
      type: "synthesis",
      wav,
    };
    workerScope.postMessage(response, [wav]);
  } catch (error: unknown) {
    const response: VoiceWorkerResponse = {
      id: request.id,
      message: error instanceof Error ? error.message : String(error),
      ok: false,
      type: "synthesis",
    };
    workerScope.postMessage(response);
  }
};
