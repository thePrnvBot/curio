import { Button } from "@curio/ui/components/button";
import {
  MessageResponse,
} from "@curio/ui/components/ai-elements/message";
import type { LessonContent } from "@curio/db/schema/course";
import { CheckIcon, XIcon } from "lucide-react";
import { useState, type ReactElement } from "react";

export function LessonContentView(props: {
  lesson: {
    readonly completed: boolean;
    readonly content: LessonContent | null;
    readonly id: string;
    readonly kind: string;
    readonly position: number;
    readonly title: string;
  };
}): ReactElement | null {
  const content = props.lesson.content;

  if (content === null) {
    return (
      <div className="bg-card/50 rounded-xl border p-6 text-center">
        <p className="font-medium">Content for this lesson is on its way</p>
        <p className="text-muted-foreground mt-1 text-sm">
          This lesson was created before the full course pages shipped. Ask the
          Director to rebuild it for finished content.
        </p>
      </div>
    );
  }

  switch (content.kind) {
    case "animation":
      return (
        <div className="space-y-6">
          <div className="prose-sm">
            <MessageResponse>{content.body}</MessageResponse>
          </div>
          <iframe
            className="bg-background w-full rounded-xl border"
            sandbox="allow-scripts allow-forms"
            srcDoc={content.html}
            style={{ height: 420 }}
            title="Interactive animation"
          />
        </div>
      );
    case "cards":
      return (
        <div className="space-y-6">
          {content.body !== undefined && (
            <div className="prose-sm">
              <MessageResponse>{content.body}</MessageResponse>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {content.cards.map((card) => (
              <div className="bg-card rounded-xl border p-5" key={card.title}>
                <p className="font-medium">{card.title}</p>
                <div className="text-muted-foreground mt-2 text-sm">
                  <MessageResponse>{card.body}</MessageResponse>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    case "recap":
      return <RecapExerciseView questions={content.questions} />;
    case "video":
      return (
        <div className="space-y-6">
          <div className="bg-muted/50 flex aspect-video items-center justify-center rounded-xl border">
            <span className="text-muted-foreground/50 text-xs tracking-widest uppercase">
              Video slot
            </span>
          </div>
          <div className="prose-sm">
            <MessageResponse>{content.body}</MessageResponse>
          </div>
        </div>
      );
    default: {
      return null;
    }
  }
}

interface RecapQuestion {
  readonly answerIndex: number;
  readonly explanation?: string;
  readonly options: readonly string[];
  readonly prompt: string;
}

function RecapExerciseView(props: {
  questions: readonly RecapQuestion[];
}): ReactElement {
  // Picked option index per question (undefined until answered)
  const [pickedOptions, setPickedOptions] = useState<
    Record<number, number | undefined>
  >({});
  const [checked, setChecked] = useState(false);

  const allAnswered = props.questions.every(
    (_question, questionIndex) => pickedOptions[questionIndex] !== undefined
  );
  const correctCount = checked
    ? props.questions.filter(
        (question, questionIndex) =>
          pickedOptions[questionIndex] === question.answerIndex
      ).length
    : 0;
  const allCorrect = checked && correctCount === props.questions.length;

  function resetAnswers(): void {
    setPickedOptions({});
    setChecked(false);
  }

  const optionClass = ({
    checked,
    isPicked,
    isAnswer,
  }: {
    checked: boolean;
    isPicked: boolean;
    isAnswer: boolean;
  }): string => {
    if (checked) {
      if (isAnswer) {
        return "border-primary bg-primary/10 text-primary flex w-full items-center justify-between gap-3 rounded-lg px-3.5 py-2.5 text-left text-sm";
      }
      if (isPicked) {
        return "border-destructive/60 bg-destructive/5 text-destructive flex w-full items-center justify-between gap-3 rounded-lg px-3.5 py-2.5 text-left text-sm";
      }
      return "text-muted-foreground/60 w-full rounded-lg border px-3.5 py-2.5 text-left text-sm";
    }
    return isPicked
      ? "border-primary bg-primary/10 text-primary w-full rounded-lg px-3.5 py-2.5 text-left text-sm"
      : "hover:border-ring hover:bg-accent text-foreground w-full rounded-lg border px-3.5 py-2.5 text-left text-sm";
  };

  return (
    <div className="space-y-4">
      {props.questions.map((question, questionIndex) => {
        const pickedOption = pickedOptions[questionIndex];
        const isPickedCorrect = pickedOption === question.answerIndex;
        return (
          <div className="bg-card rounded-xl border p-5" key={question.prompt}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium">
                <span className="text-muted-foreground mr-2">
                  {questionIndex + 1}
                </span>
                {question.prompt}
              </p>
              {checked &&
                (isPickedCorrect ? (
                  <span className="bg-primary/10 text-primary flex size-6 shrink-0 items-center justify-center rounded-full">
                    <CheckIcon className="size-3.5" aria-hidden="true" />
                  </span>
                ) : (
                  <span className="border-destructive/40 bg-destructive/10 text-destructive flex size-6 shrink-0 items-center justify-center rounded-full border">
                    <XIcon className="size-3.5" aria-hidden="true" />
                  </span>
                ))}
            </div>
            <div className="mt-3 space-y-2">
              {question.options.map((option, optionIndex) => (
                <button
                  className={optionClass({
                    checked,
                    isPicked: pickedOption === optionIndex,
                    isAnswer: optionIndex === question.answerIndex,
                  })}
                  disabled={checked}
                  key={option}
                  onClick={() => {
                    setPickedOptions({
                      ...pickedOptions,
                      [questionIndex]: optionIndex,
                    });
                  }}
                  type="button"
                >
                  <span>{option}</span>
                  {checked && optionIndex === question.answerIndex && (
                    <span className="text-xs font-medium opacity-70">
                      correct
                    </span>
                  )}
                  {checked && pickedOption === optionIndex && !isPickedCorrect && (
                    <span className="text-xs font-medium opacity-70">
                      your answer
                    </span>
                  )}
                </button>
              ))}
            </div>
            {checked && pickedOption !== undefined && !isPickedCorrect && (
              <div className="border-destructive/30 bg-destructive/5 mt-3 rounded-lg border-l-3 px-3.5 py-2.5">
                <p className="text-destructive text-xs font-semibold">
                  {question.explanation !== undefined && question.explanation.length > 0
                    ? "Why not"
                    : "Not quite"}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                  {question.explanation ??
                    "Revisit the lesson above and try a fresh take."}
                </p>
              </div>
            )}
          </div>
        );
      })}

      <div className="mt-3 flex items-center justify-between gap-4">
        <p className="text-muted-foreground text-xs">
          {checked
            ? allCorrect
              ? "All correct - move on when ready."
              : `${correctCount} of ${props.questions.length} correct`
            : allAnswered
              ? `${props.questions.length} question${
                  props.questions.length === 1 ? "" : "s"
                } answered - ready to check`
              : "Pick an option for every question"}
        </p>
        <div className="flex items-center gap-2">
          {checked && !allCorrect ? (
            <Button onClick={resetAnswers} size="sm" variant="outline">
              Try again
            </Button>
          ) : null}
          {checked ? null : (
            <Button
              disabled={!allAnswered}
              onClick={() => {
                setChecked(true);
              }}
              size="sm"
            >
              Check answers
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
