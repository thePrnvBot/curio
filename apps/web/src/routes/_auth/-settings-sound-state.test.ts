import { describe, expect, it } from "vitest";

import type { SoundToggleState } from "./-settings-sound-state";
import { soundToggleReducer } from "./-settings-sound-state";

describe("soundToggleReducer", () => {
  it("hydrates to enabled when sound is on", () => {
    const next = soundToggleReducer(
      { kind: "uninitialized" },
      { type: "hydrate", enabled: true }
    );
    expect(next).toEqual({ kind: "enabled" });
  });

  it("hydrates to disabled when sound is off", () => {
    const next = soundToggleReducer(
      { kind: "uninitialized" },
      { type: "hydrate", enabled: false }
    );
    expect(next).toEqual({ kind: "disabled" });
  });

  it("ignores non-hydrate actions while uninitialized", () => {
    const state: SoundToggleState = { kind: "uninitialized" };
    expect(soundToggleReducer(state, { type: "request-enable" })).toBe(state);
    expect(soundToggleReducer(state, { type: "request-disable" })).toBe(state);
    expect(soundToggleReducer(state, { type: "enable-succeeded" })).toBe(state);
    expect(soundToggleReducer(state, { type: "enable-failed" })).toBe(state);
  });

  it("transitions from disabled to enabling", () => {
    const next = soundToggleReducer(
      { kind: "disabled" },
      { type: "request-enable" }
    );
    expect(next).toEqual({ kind: "enabling" });
  });

  it("transitions from unavailable to enabling", () => {
    const next = soundToggleReducer(
      { kind: "unavailable" },
      { type: "request-enable" }
    );
    expect(next).toEqual({ kind: "enabling" });
  });

  it("transitions from enabling to enabled on success", () => {
    const next = soundToggleReducer(
      { kind: "enabling" },
      { type: "enable-succeeded" }
    );
    expect(next).toEqual({ kind: "enabled" });
  });

  it("transitions from enabling to unavailable on failure", () => {
    const next = soundToggleReducer(
      { kind: "enabling" },
      { type: "enable-failed" }
    );
    expect(next).toEqual({ kind: "unavailable" });
  });

  it("transitions from enabled to disabled", () => {
    const next = soundToggleReducer(
      { kind: "enabled" },
      { type: "request-disable" }
    );
    expect(next).toEqual({ kind: "disabled" });
  });

  it("ignores disable requests when not enabled", () => {
    const disabled: SoundToggleState = { kind: "disabled" };
    expect(soundToggleReducer(disabled, { type: "request-disable" })).toBe(
      disabled
    );

    const enabling: SoundToggleState = { kind: "enabling" };
    expect(soundToggleReducer(enabling, { type: "request-disable" })).toBe(
      enabling
    );

    const unavailable: SoundToggleState = { kind: "unavailable" };
    expect(soundToggleReducer(unavailable, { type: "request-disable" })).toBe(
      unavailable
    );
  });

  it("ignores enable requests when already enabled or enabling", () => {
    const enabled: SoundToggleState = { kind: "enabled" };
    expect(soundToggleReducer(enabled, { type: "request-enable" })).toBe(
      enabled
    );

    const enabling: SoundToggleState = { kind: "enabling" };
    expect(soundToggleReducer(enabling, { type: "request-enable" })).toBe(
      enabling
    );
  });
});
