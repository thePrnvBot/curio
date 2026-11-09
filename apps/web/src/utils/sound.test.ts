import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { disableInteractionSounds, soundSettingEnabled } from "./sound";

describe("sound preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("is enabled by default", () => {
    expect(soundSettingEnabled()).toBe(true);
  });

  it("is disabled after calling disableInteractionSounds", () => {
    disableInteractionSounds();
    expect(soundSettingEnabled()).toBe(false);
  });
});
