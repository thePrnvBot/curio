"use client";

import { isToolUIPart } from "ai";
import type { UIMessage } from "ai";
import { useState } from "react";

import { toPendingQuestions } from "@/utils/chat-schemas";
import type { PendingQuestions } from "@/utils/chat-schemas";

const ASK_USER_TOOL_NAME = "ask_user";

export function extractPendingQuestions(
  messages: readonly UIMessage[]
): PendingQuestions | null {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex--) {
    const candidateMessage = messages[messageIndex];
    if (candidateMessage.role !== "assistant") {
      // The panel only applies to the most recent exchange
      break;
    }
    for (const part of candidateMessage.parts) {
      if (
        isToolUIPart(part) &&
        part.type === `tool-${ASK_USER_TOOL_NAME}` &&
        part.state !== "output-available" &&
        part.state !== "output-error"
      ) {
        return toPendingQuestions(part.input);
      }
    }
    break;
  }
  return null;
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
  const questions = pendingQuestions.questions;
  const [currentStep, setCurrentStep] = useState(0);
  const [pickedOptions, setPickedOptions] = useState<
    Record<number, number | undefined>
  >({});

  const isLastStep = currentStep >= questions.length - 1;
  const currentQuestion = questions[currentStep];

  function sendAllAnswers(
    finalPicks: Record<number, number | undefined> = pickedOptions
  ): void {
    const header = pendingQuestions.intro;
    const answerLines = questions.map((question, questionIndex) => {
      const pickedOption = finalPicks[questionIndex];
      const answer =
        pickedOption === undefined ? "" : question.options[pickedOption];
      return `- ${question.question}: ${answer}`;
    });
    onAnswered([header, ...answerLines].join("\n"));
  }

  function pickOption(optionIndex: number): void {
    // Compose the next picks map up front: the final pick must be part of
    // the answers that get sent (state updates are async - reading
    // `pickedOptions` here would send without the last answer).
    const nextPicks = { ...pickedOptions, [currentStep]: optionIndex };
    setPickedOptions(nextPicks);
    // One question per step: picking lands on the next question; the last
    // pick sends the whole answer set.
    if (isLastStep) {
      sendAllAnswers(nextPicks);
      return;
    }
    setCurrentStep(currentStep + 1);
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
      <div className="min-h-[190px] w-full flex-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
        <p className="text-foreground w-full text-base font-medium">
          {currentQuestion.question}
        </p>
        <div className="mt-3 flex w-full flex-col gap-2">
          {currentQuestion.options.map((option, optionIndex) => {
            const isPicked = pickedOptions[currentStep] === optionIndex;
            return (
              <button
                aria-pressed={isPicked}
                className={
                  isPicked
                    ? "bg-primary text-primary-foreground w-full rounded-lg border border-primary/60 px-4 py-3 text-left text-[15px] font-medium"
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
            setCurrentStep(Math.max(currentStep - 1, 0));
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
            const isAnswered = pickedOptions[questionIndex] !== undefined;
            const isCurrent = questionIndex === currentStep;
            return (
              <span
                className={
                  isCurrent
                    ? "bg-foreground size-2 rounded-full"
                    : isAnswered
                      ? "bg-primary size-2 rounded-full"
                      : "bg-muted-foreground/40 size-2 rounded-full"
                }
                key={question.question}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

