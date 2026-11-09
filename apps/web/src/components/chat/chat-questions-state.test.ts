import { describe, expect, it } from "vitest";

import type { WizardState } from "./chat-questions-state";
import { formatWizardAnswers, wizardReducer } from "./chat-questions-state";

const pendingQuestions = {
  intro: "Please answer:",
  questions: [
    { question: "Favorite color?", options: ["Red", "Blue"] },
    { question: "Favorite shape?", options: ["Circle", "Square"] },
  ],
};

describe("wizardReducer", () => {
  it("advances to the next step on pick", () => {
    const initial: WizardState = {
      kind: "answering",
      currentStep: 0,
      picks: new Map(),
    };
    const next = wizardReducer(initial, { type: "pick", optionIndex: 1 }, 2);
    expect(next).toEqual({
      kind: "answering",
      currentStep: 1,
      picks: new Map([[0, 1]]),
    });
  });

  it("submits when the last question is answered", () => {
    const initial: WizardState = {
      kind: "answering",
      currentStep: 1,
      picks: new Map([[0, 0]]),
    };
    const next = wizardReducer(initial, { type: "pick", optionIndex: 1 }, 2);
    expect(next).toEqual({
      kind: "submitted",
      picks: new Map([
        [0, 0],
        [1, 1],
      ]),
    });
  });

  it("goes back to the previous step", () => {
    const initial: WizardState = {
      kind: "answering",
      currentStep: 1,
      picks: new Map([[0, 0]]),
    };
    const next = wizardReducer(initial, { type: "back" }, 2);
    expect(next).toEqual({
      kind: "answering",
      currentStep: 0,
      picks: new Map([[0, 0]]),
    });
  });

  it("does not go back past the first step", () => {
    const initial: WizardState = {
      kind: "answering",
      currentStep: 0,
      picks: new Map(),
    };
    const next = wizardReducer(initial, { type: "back" }, 2);
    expect(next).toEqual({
      kind: "answering",
      currentStep: 0,
      picks: new Map(),
    });
  });

  it("resets from submitted to answering", () => {
    const initial: WizardState = {
      kind: "submitted",
      picks: new Map([[0, 0]]),
    };
    const next = wizardReducer(initial, { type: "reset" }, 2);
    expect(next).toEqual({
      kind: "answering",
      currentStep: 0,
      picks: new Map(),
    });
  });

  it("ignores picks after submission", () => {
    const initial: WizardState = {
      kind: "submitted",
      picks: new Map([[0, 0]]),
    };
    expect(wizardReducer(initial, { type: "pick", optionIndex: 1 }, 2)).toBe(
      initial
    );
    expect(wizardReducer(initial, { type: "back" }, 2)).toBe(initial);
  });
});

describe("formatWizardAnswers", () => {
  it("formats answered and unanswered questions", () => {
    const picks = new Map([[0, 1]]);
    const text = formatWizardAnswers(pendingQuestions, picks);
    expect(text).toBe(
      "Please answer:\n- Favorite color?: Blue\n- Favorite shape?: "
    );
  });
});
