/**
 * Interaction sounds, built directly on Tone.js.
 *
 * Replaces cuelume: the cue set (navigate/toggle/select/tap/ready/error/
 * close/success) is rendered by a single triangle PolySynth, with per-cue
 * note tables and an emphasis-to-velocity mapping. The app owns the
 * preference (localStorage); the AudioContext is unlocked on the first user
 * gesture and cues are skipped while the context is still suspended.
 */

import { PolySynth, Synth, Volume, getContext, now, start } from "tone";

export type SoundName =
  | "close"
  | "error"
  | "navigate"
  | "ready"
  | "select"
  | "success"
  | "tap"
  | "toggle";

export type Emphasis = "subtle" | "normal" | "strong";

export interface PlayOptions {
  /** Directional cues (select) flip their pitch contour. */
  readonly direction?: "forward" | "back";
  readonly emphasis?: Emphasis;
}

const SOUND_PREFERENCE_KEY = "curio-sound-enabled";

export function soundSettingEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(SOUND_PREFERENCE_KEY) !== "disabled";
}

export function disableInteractionSounds(): void {
  window.localStorage.setItem(SOUND_PREFERENCE_KEY, "disabled");
}

/* --------------------------------- engine --------------------------------- */

let masterVolume: Volume | null = null;
let cueSynth: PolySynth<Synth> | null = null;

function ensureEngine(): PolySynth<Synth> | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (cueSynth === null || masterVolume === null) {
    masterVolume = new Volume(-8).toDestination();
    cueSynth = new PolySynth(Synth, {
      envelope: {
        attack: 0.002,
        decay: 0.14,
        release: 0.2,
        sustain: 0.03,
      },
      oscillator: { type: "triangle" },
    }).connect(masterVolume);
    cueSynth.maxPolyphony = 12;
  }
  return cueSynth;
}

async function unlockSounds(): Promise<boolean> {
  try {
    await start();
    ensureEngine();
    return getContext().state === "running";
  } catch {
    return false;
  }
}

/* ------------------------------ cue definitions ----------------------------- */

interface CueNote {
  /** Offset from cue start, in seconds. */
  readonly at: number;
  readonly duration: number;
  readonly note: string;
}

function buildCue(
  name: SoundName,
  direction?: "forward" | "back"
): readonly CueNote[] {
  switch (name) {
    case "close": {
      return [
        { at: 0, duration: 0.08, note: "E5" },
        { at: 0.07, duration: 0.12, note: "C5" },
      ];
    }
    case "error": {
      return [
        { at: 0, duration: 0.16, note: "C4" },
        { at: 0.09, duration: 0.2, note: "F#3" },
      ];
    }
    case "navigate": {
      return [
        { at: 0, duration: 0.07, note: "G5" },
        { at: 0.07, duration: 0.09, note: "C6" },
      ];
    }
    case "ready": {
      return [
        { at: 0, duration: 0.1, note: "C5" },
        { at: 0.07, duration: 0.1, note: "E5" },
        { at: 0.14, duration: 0.16, note: "G5" },
      ];
    }
    case "select": {
      // Pitch contour follows the travel direction.
      const first = direction === "back" ? "A5" : "E5";
      const second = direction === "back" ? "E5" : "A5";
      return [
        { at: 0, duration: 0.07, note: first },
        { at: 0.06, duration: 0.09, note: second },
      ];
    }
    case "success": {
      return [
        { at: 0, duration: 0.09, note: "C5" },
        { at: 0.08, duration: 0.09, note: "E5" },
        { at: 0.16, duration: 0.09, note: "G5" },
        { at: 0.24, duration: 0.16, note: "C6" },
      ];
    }
    case "tap": {
      return [{ at: 0, duration: 0.05, note: "C6" }];
    }
    case "toggle": {
      return [{ at: 0, duration: 0.09, note: "A5" }];
    }
    default: {
      return [];
    }
  }
}

const VELOCITY_BY_EMPHASIS: Record<Emphasis, number> = {
  normal: 0.5,
  strong: 0.85,
  subtle: 0.22,
};

/* --------------------------------- public --------------------------------- */

/** Play an outcome cue from code. Respects the global enabled setting and is
 * a no-op until the AudioContext has been unlocked by a gesture. */
export function playInteractionCue(
  name: SoundName,
  options?: PlayOptions
): void {
  if (!soundSettingEnabled() || getContext().state !== "running") {
    return;
  }
  const synth = ensureEngine();
  if (synth === null) {
    return;
  }
  const emphasis = options?.emphasis ?? "normal";
  const velocity = VELOCITY_BY_EMPHASIS[emphasis];
  const playbackTime = now();
  for (const cueNote of buildCue(name, options?.direction)) {
    synth.triggerAttackRelease(
      cueNote.note,
      cueNote.duration,
      playbackTime + cueNote.at,
      velocity
    );
  }
}

/** Save + enable interaction sounds from a user gesture; returns whether the
 * browser actually unlocked audio. */
export async function enableInteractionSounds(): Promise<boolean> {
  window.localStorage.setItem(SOUND_PREFERENCE_KEY, "enabled");
  return await unlockSounds();
}

const gestureUnlockHandler = (): void => {
  if (!soundSettingEnabled()) {
    return;
  }
  void unlockSounds();
};

const delegatedClickHandler = (event: MouseEvent): void => {
  if (!soundSettingEnabled()) {
    return;
  }
  const target = event.target as HTMLElement | null;
  if (target?.closest("[data-cue]") === null) {
    return;
  }
  playInteractionCue("navigate");
};

/** Bind once from the root layout: the first-gesture context unlock and the
 * delegated `data-cue` click sounds. Returns the unbind cleanup. */
export function bindInteractionSounds(): () => void {
  window.addEventListener("pointerdown", gestureUnlockHandler, {
    passive: true,
  });
  window.addEventListener("keydown", gestureUnlockHandler, { passive: true });
  document.addEventListener("click", delegatedClickHandler);
  return () => {
    window.removeEventListener("pointerdown", gestureUnlockHandler);
    window.removeEventListener("keydown", gestureUnlockHandler);
    document.removeEventListener("click", delegatedClickHandler);
  };
}
