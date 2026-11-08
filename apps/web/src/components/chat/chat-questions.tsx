import { ASK_USER_TOOL_NAME } from "@curio/api/infrastructure/ask-user-tool";
import { isToolUIPart } from "ai";
import type { UIMessage } from "ai";
import { Option } from "effect";
import { useEffect, useReducer, useRef } from "react";

import { toPendingQuestions } from "@/utils/chat-schemas";
import type { PendingQuestions } from "@/utils/chat-schemas";

import { formatWizardAnswers, wizardReducer } from "./chat-questions-state";

export function extractPendingQuestions(
  messages: readonly UIMessage[]
): Option.Option<PendingQuestions> {
  // The panel only applies to the most recent exchange: a questionnaire on
  // an earlier assistant message is considered answered/stale, regardless
  // of how the parts look.
  const latestMessage = messages.at(-1);
  if (latestMessage?.role !== "assistant") {
    return Option.none();
  }
  for (const part of latestMessage.parts) {
    if (
      isToolUIPart(part) &&
      part.type === `tool-${ASK_USER_TOOL_NAME}` &&
      part.state !== "output-available" &&
      part.state !== "output-error"
    ) {
      return toPendingQuestions(part.input);
    }
  }
  return Option.none();
}

function progressDotClass(isAnswered: boolean, isCurrent: boolean): string {
  if (isCurrent) {
    return "bg-foreground size-2 rounded-full";
  }
  if (isAnswered) {
    return "bg-primary size-2 rounded-full";
  }
  return "bg-muted-foreground/40 size-2 rounded-full";
}

export function PendingQuestionsPanel({
  busy,
  onAnswered,
  pendingQuestions,
}: {
  busy: boolean;
  onAnswered: (answersText: string) => void;
  pendingQuestions: PendingQuestions;
}) {
  const { questions } = pendingQuestions;
  const [state, dispatch] = useReducer(
    (wizardState: ReturnType<typeof wizardReducer>, action: Parameters<typeof wizardReducer>[1]) =>
      wizardReducer(wizardState, action, questions.length),
    { kind: "answering", currentStep: 0, picks: new Map() }
  );
  // Submission is sent exactly once per wizard run: onAnswered identities can
  // change every render upstream, so the sent-flag (not the callback) gates it.
  const hasSentRef = useRef(false);
  useEffect(() => {
    if (state.kind === "answering") {
      hasSentRef.current = false;
      return;
    }
    if (hasSentRef.current) {
      return;
    }
    hasSentRef.current = true;
    onAnswered(formatWizardAnswers(pendingQuestions, state.picks));
  }, [pendingQuestions, state, onAnswered]);

  const currentStep = state.kind === "answering" ? state.currentStep : questions.length - 1;
  const currentQuestion = questions[currentStep];
  const { picks } = state;
  const pickedChoiceIndex = Option.fromNullishOr(picks.get(currentStep));

  function pickOption(optionIndex: number): void {
    dispatch({ type: "pick", optionIndex });
  }

  return (
    // data-align="block-start" tells the wrapping InputGroup this render owns
    // the whole input area - without it the group stays h-7 tall and clips
    // the questionnaire (the textarea unlock is unavailable in this state).
    <div
      className="flex min-h-[280px] w-full flex-col px-5 py-5"
      data-align="block-start"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-sm leading-relaxed">
          {pendingQuestions.intro}
        </p>
        <p className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {currentStep + 1} of {questions.length}
        </p>
      </div>

      {/* Fixed-size stage: the header and progress row stay put while
        stepping, and longer question/option sets scroll inside the reserved
        box instead of shifting the surrounding input. */}
      <div className="min-h-[190px] w-full flex-1 [scrollbar-width:thin] overflow-y-auto pr-1">
        <p className="text-foreground w-full text-base font-medium">
          {currentQuestion.question}
        </p>
        <div className="mt-3 flex w-full flex-col gap-2">
          {currentQuestion.options.map((option, optionIndex) => {
            const isPicked = Option.match(pickedChoiceIndex, {
              onNone: () => false,
              onSome: (pickedOptionIndex) => pickedOptionIndex === optionIndex,
            });
            return (
              <button
                aria-pressed={isPicked}
                className={
                  isPicked
                    ? "bg-primary text-primary-foreground border-primary/60 w-full rounded-lg border px-4 py-3 text-left text-[15px] font-medium"
                    : "hover:bg-accent hover:text-accent-foreground text-muted-foreground w-full rounded-lg border px-4 py-3 text-left text-[15px] transition-colors"
                }
                disabled={busy}
                key={option}
                onClick={() => {
                  pickOption(optionIndex);
                }}
                type="button"
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          className="text-muted-foreground hover:text-foreground rounded-md px-2 py-1 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
          disabled={currentStep === 0 || busy}
          onClick={() => {
            dispatch({ type: "back" });
          }}
          type="button"
        >
          Back
        </button>
        <div
          className="flex items-center gap-1.5"
          aria-label={`Question ${currentStep + 1} of ${questions.length}`}
        >
          {questions.map((question, questionIndex) => {
            const isAnswered = Option.isSome(
              Option.fromNullishOr(picks.get(questionIndex))
            );
            const isCurrent = questionIndex === currentStep;
            return (
              <span
                className={progressDotClass(isAnswered, isCurrent)}
                key={question.question}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
