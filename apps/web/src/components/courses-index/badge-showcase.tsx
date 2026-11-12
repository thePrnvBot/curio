import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, TrophyIcon, XIcon } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { playInteractionCue } from "@/utils/sound";
import { useTRPC } from "@/utils/trpc";

import { SectionHeader } from "./section-shared";
import type { CourseBadgeView } from "./section-shared";

/** Earned medal row, or an invite to earn the first one. The pencil at the
 * header's right end toggles an edit mode that lets each badge be removed. */
export function BadgeShowcaseSection({
  badges,
  empty,
}: {
  badges: readonly CourseBadgeView[];
  empty: ReactNode;
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

  const canEdit = badges.length > 0;

  const badgeContent: ReactNode =
    badges.length > 0 ? (
      <div className="surface-card p-5">
        <div className="flex flex-wrap gap-x-7 gap-y-5">
          {badges.map((badge) => (
            <div
              className="relative flex w-16 flex-col items-center gap-2 text-center"
              key={badge.id}
            >
              <span className="ring-brand/15 bg-brand/10 text-brand flex size-14 items-center justify-center rounded-full ring-4">
                <TrophyIcon className="size-5" aria-hidden="true" />
              </span>
              <span className="text-foreground text-xs leading-tight font-medium">
                {badge.label}
              </span>
              {isEditing ? (
                <button
                  aria-label={`Delete badge ${badge.label}`}
                  className={`${deleteBadge.isPending ? "bg-background border-destructive/50 text-destructive" : "bg-background hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"} focus-visible:ring-ring absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border shadow-xs transition-colors focus-visible:ring-2 focus-visible:outline-none`}
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
    ) : (
      empty
    );

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <SectionHeader className="mb-0">Badge showcase</SectionHeader>
        {canEdit ? (
          <button
            aria-pressed={isEditing}
            className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
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
