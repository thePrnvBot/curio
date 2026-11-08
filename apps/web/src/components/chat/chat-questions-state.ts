/** Internal state machine for the pending-questions wizard. */
export type WizardState =
  | {
      readonly kind: "answering";
      readonly currentStep: number;
      readonly picks: ReadonlyMap<number, number>;
    }
  | { readonly kind: "submitted"; readonly picks: ReadonlyMap<number, number> };

export type WizardAction =
  | { readonly type: "pick"; readonly optionIndex: number }
  | { readonly type: "back" }
  | { readonly type: "reset" };

export function wizardReducer(
  state: WizardState,
  action: WizardAction,
  questionCount: number
): WizardState {
  switch (state.kind) {
    case "answering": {
      if (action.type === "pick") {
        const nextPicks = new Map([...state.picks, [state.currentStep, action.optionIndex]]);
        if (state.currentStep >= questionCount - 1) {
          return { kind: "submitted", picks: nextPicks };
        }
        return {
          kind: "answering",
          currentStep: state.currentStep + 1,
          picks: nextPicks,
        };
      }
      if (action.type === "back") {
        return {
          kind: "answering",
          currentStep: Math.max(state.currentStep - 1, 0),
          picks: state.picks,
        };
      }
      break;
    }
    case "submitted": {
      if (action.type === "reset") {
        return { kind: "answering", currentStep: 0, picks: new Map() };
      }
      break;
    }
    default: {
      return state;
    }
  }
  return state;
}

/** Formats the collected picks into the answer text the chat expects. */
export function formatWizardAnswers(
  pendingQuestions: { readonly intro: string; readonly questions: readonly { readonly question: string; readonly options: readonly string[] }[] },
  picks: ReadonlyMap<number, number>
): string {
  const answerLines = pendingQuestions.questions.map((question, questionIndex) => {
    const pickedOptionIndex = picks.get(questionIndex);
    const answer =
      pickedOptionIndex === undefined ? "" : question.options[pickedOptionIndex];
    return `- ${question.question}: ${answer}`;
  });
  return [pendingQuestions.intro, ...answerLines].join("\n");
}
