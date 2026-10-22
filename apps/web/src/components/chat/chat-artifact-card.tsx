import { Option } from "effect";

import type { ArtifactUIData } from "@/utils/ui-messages";

import { ArtifactPreviewer } from "./chat-artifact-preview";

/**
 * The bordered inline artifact card shown inside the transcript: a title
 * strip (only when the artifact named itself), the content preview, and the
 * Director's one-line summary underneath.
 */
export function ArtifactInlineView({ data }: { data: ArtifactUIData }) {
  return (
    <div className="bg-card mx-auto w-full max-w-xl overflow-hidden rounded-lg border">
      {Option.isSome(data.title) && (
        <div className="bg-background/60 text-muted-foreground flex items-center justify-between gap-2 border-b px-3 py-1.5 text-xs font-medium">
          <span className="min-w-0 truncate">{data.title.value}</span>
        </div>
      )}
      <div className="p-2">
        <ArtifactPreviewer data={data} />
      </div>
      {Option.isSome(data.summary) && (
        <p className="text-muted-foreground border-t px-3 py-2 text-xs">
          {data.summary.value}
        </p>
      )}
    </div>
  );
}
