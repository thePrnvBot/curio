import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_VOICE_PREFERENCES,
  normalizeVoiceGpuPreference,
  readVoicePreferences,
  saveVoicePreferences,
} from "./voice-cache";

afterEach(() => {
  window.localStorage.clear();
});

describe("normalizeVoiceGpuPreference", () => {
  it("keeps the three supported hints", () => {
    expect(normalizeVoiceGpuPreference("auto")).toBe("auto");
    expect(normalizeVoiceGpuPreference("high-performance")).toBe(
      "high-performance"
    );
    expect(normalizeVoiceGpuPreference("low-power")).toBe("low-power");
    expect(normalizeVoiceGpuPreference("wasm")).toBe("wasm");
  });

  it("falls back for unknown or malformed persisted values", () => {
    expect(normalizeVoiceGpuPreference(null)).toBe(
      DEFAULT_VOICE_PREFERENCES.gpuPreference
    );
    expect(normalizeVoiceGpuPreference("ultra")).toBe(
      DEFAULT_VOICE_PREFERENCES.gpuPreference
    );
    expect(normalizeVoiceGpuPreference(3)).toBe(
      DEFAULT_VOICE_PREFERENCES.gpuPreference
    );
  });
});

describe("readVoicePreferences", () => {
  it("round-trips the GPU preference and migrates old records", () => {
    saveVoicePreferences({
      ...DEFAULT_VOICE_PREFERENCES,
      enabled: true,
      gpuPreference: "low-power",
    });
    expect(readVoicePreferences().gpuPreference).toBe("low-power");

    window.localStorage.setItem(
      "curio-voice-preferences",
      JSON.stringify({ enabled: true, speed: 1.25, voiceId: "af_bella" })
    );
    expect(readVoicePreferences()).toMatchObject({
      enabled: true,
      gpuPreference: DEFAULT_VOICE_PREFERENCES.gpuPreference,
      speed: 1.25,
      voiceId: "af_bella",
    });
  });
});
