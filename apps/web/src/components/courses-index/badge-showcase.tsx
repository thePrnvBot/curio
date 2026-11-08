import { Skeleton } from "@curio/ui/components/skeleton";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, TrophyIcon, XIcon } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { playInteractionCue } from "@/utils/sound";
import { useTRPC } from "@/utils/trpc";

import { SectionHeader } from "./section-shared";
import type { CourseBadgeView } from "./section-shared";

const BADGE_SKELETONS = [0, 1, 2, 3, 4, 5, 6, 7];

/** Earned medal row, or an invite to earn the first one. The pencil at the
 * header's right end toggles an edit mode that lets each badge be removed. */
export function BadgeShowcaseSection({
  badges,
  empty,
  loading,
}: {
  badges: readonly CourseBadgeView[];
  empty: ReactNode;
  loading: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const deleteBadge = useMutation(trpc.courses.deleteBadge.mutationOptions());

  function removeBadge(badgeId: string, badgeLabel: string): void {
    deleteBadge.mutate(
      { badgeId },
      {
        onError: (mutationError) => {
          toast.error(mutationError.message);
        },
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: trpc.courses.pathKey(),
          });
          playInteractionCue("close", { emphasis: "strong" });
          toast.success(`Badge "${badgeLabel}" removed`);
          // Nothing left to edit: drop out of edit mode.
          if (badges.length <= 1) {
            setIsEditing(false);
          }
        },
      }
    );
  }

  const canEdit = !loading && badges.length > 0;

  let badgeContent: ReactNode;
  if (loading) {
    // Same card chrome as the empty and earned states, so stepping
    // between skeleton → earned badges never changes layout language.
    badgeContent = (
      <div className="bg-card/50 rounded-xl border p-5 md:p-6">
        <div className="flex flex-wrap gap-x-7 gap-y-5">
          {BADGE_SKELETONS.map((index) => (
            <div
              key={index}
              className="flex w-16 flex-col items-center gap-2"
              aria-hidden="true"
            >
              <Skeleton className="size-14 rounded-full" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
    );
  } else if (badges.length > 0) {
    badgeContent = (
      <div className="bg-card/50 rounded-xl border p-5 md:p-6">
        <div className="flex flex-wrap gap-x-7 gap-y-5">
          {badges.map((badge) => (
            <div
              className="relative flex w-16 flex-col items-center gap-2 text-center"
              key={badge.id}
            >
              <span className="ring-primary/20 bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full ring-4">
                <TrophyIcon className="size-5" aria-hidden="true" />
              </span>
              <span className="text-foreground text-xs leading-tight font-medium">
                {badge.label}
              </span>
              {isEditing ? (
                <button
                  aria-label={`Delete badge ${badge.label}`}
                  className={
                    deleteBadge.isPending
                      ? "bg-background border-destructive/50 text-destructive absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border shadow-xs"
                      : "bg-background hover:bg-destructive hover:text-destructive-foreground hover:border-destructive absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border shadow-xs transition-colors"
                  }
                  disabled={deleteBadge.isPending}
                  onClick={() => {
                    removeBadge(badge.id, badge.label);
                  }}
                  title={`Delete badge ${badge.label}`}
                  type="button"
                >
                  <XIcon aria-hidden="true" className="size-3" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  } else {
    badgeContent = empty;
  }

  return (
    <section>
      <div className="flex items-end justify-between gap-3">
        <SectionHeader>Badge showcase</SectionHeader>
        {canEdit ? (
          <button
            aria-pressed={isEditing}
            className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors"
            onClick={() => {
              playInteractionCue("toggle");
              setIsEditing((currentlyEditing) => !currentlyEditing);
            }}
            type="button"
          >
            <PencilIcon aria-hidden="true" className="size-3.5" />
            {isEditing ? "Done" : "Edit"}
          </button>
        ) : null}
      </div>
      {badgeContent}
    </section>
  );
}
