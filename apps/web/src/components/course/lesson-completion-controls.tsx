import { Badge } from "@curio/ui/components/badge";
import { Button } from "@curio/ui/components/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRightIcon } from "lucide-react";
import { useReducer } from "react";
import type { ReactElement } from "react";
import { toast } from "sonner";

import { playInteractionCue } from "@/utils/sound";
import { useTRPC } from "@/utils/trpc";

import { completionReducer } from "./lesson-completion-state";

export function LessonCompletionControls(props: {
  completed: boolean;
  courseId: string;
  lessonId: string;
  nextLessonId: string | null;
  nextLessonTitle: string | null;
  onGoToLesson: (lessonId: string | null) => void;
  /** How far the block sits below the content above it; the article layout
   * uses the loose default, the player passes a tight one. */
  className?: string;
}): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(completionReducer, { kind: "idle" });

  const completeLesson = useMutation(
    trpc.courses.completeLesson.mutationOptions()
  );

  async function completeAndContinue(): Promise<void> {
    if (props.completed) {
      props.onGoToLesson(props.nextLessonId);
      return;
    }

    dispatch({ type: "start" });
    try {
      const result = await completeLesson.mutateAsync({
        courseId: props.courseId,
        lessonId: props.lessonId,
      });
      void queryClient.invalidateQueries({
        queryKey: trpc.courses.pathKey(),
      });
      const badgeLabel =
        result.badge !== undefined && result.badge !== null
          ? result.badge.label
          : null;
      if (badgeLabel === null) {
        playInteractionCue("success", { emphasis: "subtle" });
      } else {
        playInteractionCue("success", { emphasis: "strong" });
      }
      dispatch({ type: "success", badgeLabel });
      props.onGoToLesson(props.nextLessonId);
    } catch (completionError: unknown) {
      dispatch({ type: "error" });
      playInteractionCue("error", { emphasis: "subtle" });
      toast.error(
        completionError instanceof Error
          ? completionError.message
          : "Couldn't complete the lesson"
      );
    }
  }

  const isBusy = state.kind === "completing" || completeLesson.isPending;

  let statusText: string;
  if (props.completed) {
    statusText = "Lesson completed";
  } else if (props.nextLessonTitle === null) {
    statusText = "Finish the course";
  } else {
    statusText = "Up next";
  }

  let buttonText: string;
  if (props.completed) {
    buttonText = props.nextLessonId === null ? "Back to courses" : "Continue";
  } else {
    buttonText =
      props.nextLessonId === null ? "Complete course" : "Complete & continue";
  }

  const earnedBadgeLabel = state.kind === "completed" ? state.badgeLabel : null;

  return (
    <div className={props.className ?? "mt-12 border-t pt-5"}>
      {earnedBadgeLabel !== null && (
        <div className="border-brand/25 bg-brand/5 mb-4 flex items-center gap-2 rounded-lg border px-4 py-3">
          <Badge variant="brand">New badge</Badge>
          <p className="text-[13px] font-medium">{earnedBadgeLabel}</p>
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[13.5px] font-medium">{statusText}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {props.nextLessonTitle ??
              (props.completed
                ? "You've reached the end of this course"
                : "Completing this lesson finishes the course")}
          </p>
        </div>
        <Button
          className="gap-1"
          disabled={isBusy}
          onClick={() => {
            void completeAndContinue();
          }}
          size="sm"
        >
          {buttonText}
          <ChevronRightIcon className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
