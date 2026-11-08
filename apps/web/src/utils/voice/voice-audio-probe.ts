/**
 * Speech-garble detector for the Kokoro worker. The old WebGPU path could
 * return full-scale static instead of speech, so every synthesis output gets
 * a cheap statistical probe; clean audio passes, garbled engines fail and
 * the worker rebuilds on the WASM engine.
 *
 * What separates speech from synthesized static:
 * - Speech is quiet-ish, never saturates, and carries pauses: even a short
 *   one-second probe spans phonemes and word gaps, so per-window RMS varies
 *   strongly. Static fills every window with similar full-band energy.
 * - NaN/Inf (wrong dtype or failed device) fails the finiteness checks.
 */

const MAX_PROBE_SAMPLES = 24_000;
const WINDOW_COUNT = 10;

/** Windowed amplitude structure: speech swings, static does not. */
export interface AudioProbeStats {
  readonly min: number;
  readonly max: number;
  /** Overall RMS across the probe window. */
  readonly rms: number;
  /** Highest single-window RMS. */
  readonly loudestWindowRms: number;
  /** Lowest single-window RMS. */
  readonly quietestWindowRms: number;
  readonly probeLength: number;
}

/** True when values look like a broken device/dtype run (NaN, saturated). */
export function statsAreSane(stats: AudioProbeStats): boolean {
  if (
    !Number.isFinite(stats.min) ||
    !Number.isFinite(stats.max) ||
    !Number.isFinite(stats.rms)
  ) {
    return false;
  }
  const peakAmplitude = Math.max(Math.abs(stats.min), Math.abs(stats.max));
  // Speech peaks sit below ~1.0; static pushes to or past full scale.
  if (peakAmplitude > 1.5) {
    return false;
  }
  if (stats.rms < 0.0001) {
    // Effectively silent output on a device that just rendered a sentence.
    return false;
  }
  return true;
}

/** True when window energy looks flat - dense noise, not structured speech. */
export function statsLookStatic(stats: AudioProbeStats): boolean {
  if (stats.probeLength < WINDOW_COUNT * 64) {
    // Far too short to judge structure; accept and let downstream checks do
    // the guarding (short utterances render fine even on the weak path).
    return false;
  }
  const loudest = Math.max(stats.loudestWindowRms, 1e-6);
  const quietest = Math.max(stats.quietestWindowRms, 0);
  // Speech always has between-window contrast. Static is flat.
  if (quietest / loudest > 0.65 && stats.rms > 0.02) {
    return true;
  }
  return false;
}

export function probeAudioSamples(samples: Float32Array): AudioProbeStats {
  const probeLength = Math.min(samples.length, MAX_PROBE_SAMPLES);
  if (probeLength === 0) {
    return {
      min: 0,
      max: 0,
      rms: 0,
      loudestWindowRms: 0,
      quietestWindowRms: 0,
      probeLength: 0,
    };
  }
  const windowSize = Math.max(1, Math.floor(probeLength / WINDOW_COUNT));

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let squaredSum = 0;

  let loudestWindowRms = 0;
  let quietestWindowRms = Number.POSITIVE_INFINITY;

  let windowSpreadSum = 0;
  let columnIndex = 0;

  for (let sampleIndex = 0; sampleIndex < probeLength; sampleIndex += 1) {
    const value = samples[sampleIndex];
    min = Math.min(min, value);
    max = Math.max(max, value);
    squaredSum += value * value;

    windowSpreadSum += value * value;
    columnIndex += 1;
    if (columnIndex === windowSize || sampleIndex === probeLength - 1) {
      const windowRms = Math.sqrt(windowSpreadSum / Math.max(columnIndex, 1));
      loudestWindowRms = Math.max(loudestWindowRms, windowRms);
      quietestWindowRms = Math.min(quietestWindowRms, windowRms);
      windowSpreadSum = 0;
      columnIndex = 0;
    }
  }

  return {
    min,
    max,
    rms: Math.sqrt(squaredSum / probeLength),
    loudestWindowRms,
    quietestWindowRms,
    probeLength,
  };
}

/**
 * Decision used by the worker: keep the engine only when the samples look
 * like real speech. Called after every synthesis on a non-WASM device.
 */
export function audioLooksLikeSpeech(samples: Float32Array): boolean {
  const stats = probeAudioSamples(samples);
  return statsAreSane(stats) && !statsLookStatic(stats);
}
