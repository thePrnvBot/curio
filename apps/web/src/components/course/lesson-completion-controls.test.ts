import { describe, expect, it } from "vitest";

import type { CompletionState } from "./lesson-completion-state";
import { completionReducer } from "./lesson-completion-state";

describe("completionReducer", () => {
  it("transitions from idle to completing on start", () => {
    const next = completionReducer({ kind: "idle" }, { type: "start" });
    expect(next).toEqual({ kind: "completing" });
  });

  it("ignores unexpected actions in idle", () => {
    const state: CompletionState = { kind: "idle" };
    expect(completionReducer(state, { type: "error" })).toBe(state);
    expect(
      completionReducer(state, { type: "success", badgeLabel: "Badge" })
    ).toBe(state);
    expect(completionReducer(state, { type: "reset" })).toBe(state);
  });

  it("transitions from completing to completed with a badge", () => {
    const next = completionReducer(
      { kind: "completing" },
      { type: "success", badgeLabel: "Prolific" }
    );
    expect(next).toEqual({ kind: "completed", badgeLabel: "Prolific" });
  });

  it("transitions from completing to completed without a badge", () => {
    const next = completionReducer(
      { kind: "completing" },
      { type: "success", badgeLabel: null }
    );
    expect(next).toEqual({ kind: "completed", badgeLabel: null });
  });

  it("transitions from completing to error", () => {
    const next = completionReducer({ kind: "completing" }, { type: "error" });
    expect(next).toEqual({ kind: "error" });
  });

  it("ignores start while already completing", () => {
    const state: CompletionState = { kind: "completing" };
    expect(completionReducer(state, { type: "start" })).toBe(state);
  });

  it("resets completed state to idle", () => {
    const next = completionReducer(
      { kind: "completed", badgeLabel: "Badge" },
      { type: "reset" }
    );
    expect(next).toEqual({ kind: "idle" });
  });

  it("resets error state to idle", () => {
    const next = completionReducer({ kind: "error" }, { type: "reset" });
    expect(next).toEqual({ kind: "idle" });
  });

  it("ignores terminal actions from completed state", () => {
    const state: CompletionState = { kind: "completed", badgeLabel: null };
    expect(completionReducer(state, { type: "start" })).toBe(state);
    expect(
      completionReducer(state, { type: "success", badgeLabel: "X" })
    ).toBe(state);
    expect(completionReducer(state, { type: "error" })).toBe(state);
  });
});
