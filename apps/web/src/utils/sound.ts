import { bind, play, setEnabled, unlock, type PlayOptions, type SoundName } from "cuelume";

/**
 * Interaction sounds, app-owned preference (cuelume never persists state
 * itself). Central import surface so call sites don't touch the library API
 * directly.
 */

const SOUND_PREFERENCE_KEY = "curio-sound-enabled";

export function soundSettingEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(SOUND_PREFERENCE_KEY) !== "disabled";
}

export function restoreSoundSetting(): void {
  setEnabled(soundSettingEnabled());
}

export function disableInteractionSounds(): void {
  window.localStorage.setItem(SOUND_PREFERENCE_KEY, "disabled");
  setEnabled(false);
}

/** Save + enable interaction sounds from a user gesture; returns whether the
 * browser actually unlocked audio. */
export async function enableInteractionSounds(): Promise<boolean> {
  window.localStorage.setItem(SOUND_PREFERENCE_KEY, "enabled");
  setEnabled(true);
  const unlocked = await unlock();
  return unlocked;
}

/** Bind the delegated data-cuelume-* listeners and restore the preference.
 * Call once from the root layout; returns the unbind cleanup. */
export function bindInteractionSounds(): () => void {
  const unbind = bind();
  restoreSoundSetting();
  return unbind;
}

/** Play an outcome cue from code. Respects the global enabled setting via
 * cuelume's own gate. */
export function playInteractionCue(
  name: SoundName,
  options?: PlayOptions
): void {
  play(name, options);
}
