import { describe, expect, it } from "vitest";

import {
  audioLooksLikeSpeech,
  probeAudioSamples,
  statsAreSane,
  statsLookStatic,
} from "./voice-audio-probe";

/** Ten windows shaped like real speech: loud phonemes, dim word gaps. */
function makeSpeechSamples(): Float32Array {
  const samples = new Float32Array(9600);
  for (let window = 0; window < 10; window += 1) {
    const amplitude = window % 2 === 0 ? 0.6 : 0.05;
    for (let offset = 0; offset < 960; offset += 1) {
      const index = window * 960 + offset;
      // Peak amplitude swings with a sine; every window differs.
      samples[index] = amplitude * Math.sin((index / 24) * Math.PI);
    }
  }
  return samples;
}

/** Ten identical full-scale windows — the garbled-static signature. */
function makeStaticSamples(): Float32Array {
  const samples = new Float32Array(9600);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = 0.3 * Math.sin((index / 12) * Math.PI);
  }
  return samples;
}

describe("probeAudioSamples", () => {
  it("measures speech statistics", () => {
    const stats = probeAudioSamples(makeSpeechSamples());
    expect(stats.probeLength).toBe(9600);
    expect(stats.loudestWindowRms).toBeGreaterThan(
      3 * stats.quietestWindowRms
    );
    expect(stats.rms).toBeGreaterThan(0.01);
  });

  it("handles empty buffers", () => {
    const stats = probeAudioSamples(new Float32Array(0));
    expect(stats.probeLength).toBe(0);
    expect(stats.rms).toBe(0);
  });
});

describe("statsAreSane", () => {
  it("passes sane speech", () => {
    const stats = probeAudioSamples(makeSpeechSamples());
    expect(statsAreSane(stats)).toBe(true);
  });

  it("rejects NaN samples", () => {
    const stats: Parameters<typeof statsAreSane>[0] = {
      loudestWindowRms: 0.2,
      max: Number.NaN,
      min: -0.2,
      probeLength: 9600,
      quietestWindowRms: 0.02,
      rms: 0.1,
    };
    expect(statsAreSane(stats)).toBe(false);
  });

  it("rejects saturated peaks", () => {
    const stats: Parameters<typeof statsAreSane>[0] = {
      loudestWindowRms: 0.9,
      max: 8,
      min: -0.2,
      probeLength: 9600,
      quietestWindowRms: 0.3,
      rms: 0.4,
    };
    expect(statsAreSane(stats)).toBe(false);
  });

  it("rejects silent output", () => {
    const stats: Parameters<typeof statsAreSane>[0] = {
      loudestWindowRms: 0.00001,
      max: 0.00001,
      min: -0.00001,
      probeLength: 9600,
      quietestWindowRms: 0.000005,
      rms: 0.000008,
    };
    expect(statsAreSane(stats)).toBe(false);
  });
});

describe("statsLookStatic", () => {
  it("accepts structured speech", () => {
    const stats = probeAudioSamples(makeSpeechSamples());
    expect(statsLookStatic(stats)).toBe(false);
  });

  it("flags flat full-scale noise", () => {
    const stats = probeAudioSamples(makeStaticSamples());
    expect(statsLookStatic(stats)).toBe(true);
  });

  it("skips judgment on too-short buffers", () => {
    const stats = probeAudioSamples(new Float32Array(600));
    expect(statsLookStatic(stats)).toBe(false);
  });
});

describe("audioLooksLikeSpeech", () => {
  it("accepts speech and rejects static", () => {
    expect(audioLooksLikeSpeech(makeSpeechSamples())).toBe(true);
    expect(audioLooksLikeSpeech(makeStaticSamples())).toBe(false);
  });
});
