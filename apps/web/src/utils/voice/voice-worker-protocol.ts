/** Wire protocol between the UI voice layer and the Kokoro web worker. */

import type { VoiceGpuPreference } from "./voice-cache";

export interface VoiceCatalogEntry {
  /** e.g. "af_heart" */
  readonly voiceId: string;
  /** Human-facing name, e.g. "Heart". */
  readonly displayName: string;
  /** Kokoro language code, e.g. "en-us". */
  readonly languageCode: string;
  /** "female" | "male" (Kokoro's own metadata). */
  readonly gender: string;
  /** Kokoro's published overall grade, e.g. "A". */
  readonly grade: string;
}

export type VoiceWorkerRequest =
  | { readonly type: "catalog" }
  | {
      readonly gpuPreference: VoiceGpuPreference;
      readonly type: "configure";
    }
  | { readonly type: "warm" }
  | {
      readonly id: number;
      readonly speed: number;
      readonly text: string;
      readonly type: "synthesize";
      readonly voiceId: string;
    };

export type VoiceWorkerResponse =
  | {
      readonly entries: readonly VoiceCatalogEntry[];
      readonly type: "catalog";
    }
  | {
      readonly percent: number;
      readonly type: "model-progress";
    }
  | {
      readonly durationMs: number;
      readonly id: number;
      readonly ok: true;
      readonly sampleRate: number;
      readonly type: "synthesis";
      /** PCM-encoded WAV bytes (16-bit). */
      readonly wav: ArrayBuffer;
    }
  | {
      readonly id: number;
      readonly message: string;
      readonly ok: false;
      readonly type: "synthesis";
    };
