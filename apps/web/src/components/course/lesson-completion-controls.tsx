import { Badge } from "@curio/ui/components/badge";
import { Button } from "@curio/ui/components/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRightIcon } from "lucide-react";
import { useState, type ReactElement } from "react";

import { playInteractionCue } from "@/utils/sound";
import { useTRPC } from "@/utils/trpc";

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
  const [isCompleting, setIsCompleting] = useState(false);
  const [earnedBadgeLabel, setEarnedBadgeLabel] = useState<string | null>(null);

  const completeLesson = useMutation(
    trpc.courses.completeLesson.mutationOptions()
  );

  async function completeAndContinue(): Promise<void> {
    if (props.completed) {
      props.onGoToLesson(props.nextLessonId);
      return;
    }
    setIsCompleting(true);
    try {
      const result = await completeLesson.mutateAsync({
        courseId: props.courseId,
        lessonId: props.lessonId,
      });
      void queryClient.invalidateQueries({
        queryKey: trpc.courses.pathKey(),
      });
      if (result.badge !== undefined && result.badge !== null) {
        setEarnedBadgeLabel(result.badge.label);
        playInteractionCue("success", { emphasis: "strong" });
      } else {
        playInteractionCue("success", { emphasis: "subtle" });
      }
      props.onGoToLesson(props.nextLessonId);
    } finally {
      setIsCompleting(false);
    }
  }

  return (
    <div className={props.className ?? "mt-10"}>
      {earnedBadgeLabel !== null && (
        <div className="border-primary/30 bg-primary/10 mb-3 flex items-center gap-2 rounded-lg border px-4 py-3">
          <Badge>{"New badge"}</Badge>
          <p className="text-sm font-medium">{earnedBadgeLabel}</p>
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">
            {props.completed
              ? "Lesson completed"
              : props.nextLessonTitle === null
                ? "Finish the course"
                : "Up next"}
          </p>
          <p className="text-muted-foreground text-xs">
            {props.nextLessonTitle ?? "One lesson away from a new badge"}
          </p>
        </div>
        <Button
          className="gap-1"
          disabled={isCompleting}
          onClick={() => {
            void completeAndContinue();
          }}
          size="sm"
        >
          {props.completed
            ? props.nextLessonId === null
              ? "Back to courses"
              : "Continue"
            : props.nextLessonId === null
              ? "Complete course"
              : "Complete & continue"}
          <ChevronRightIcon className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
