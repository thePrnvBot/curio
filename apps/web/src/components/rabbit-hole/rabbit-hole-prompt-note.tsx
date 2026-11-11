import { RabbitIcon } from "lucide-react";

import type { RabbitHolePromptView } from "@/utils/rabbit-hole-prompt";

/** Compact stand-in for the digest prompt sent back to the Director. */
export function RabbitHolePromptNote({
  prompt,
}: {
  readonly prompt: RabbitHolePromptView;
}) {
  return (
    <div className="bg-muted/40 w-full max-w-2xl rounded-xl border p-3">
      <div className="flex items-center gap-2 text-xs font-medium">
        <RabbitIcon className="size-3.5" />
        Rabbit Hole ·{" "}
        {prompt.target === "course" ? "Build a course" : "Recap notes"}
      </div>
      {prompt.takeaways !== "" && (
        <p className="mt-1.5 text-[11px] leading-relaxed">
          <span className="text-muted-foreground">Focus:</span>{" "}
          {prompt.takeaways}
        </p>
      )}
      <details className="mt-1.5">
        <summary className="text-muted-foreground cursor-pointer text-[11px] select-none">
          Session digest
        </summary>
        <pre className="text-muted-foreground mt-1.5 max-h-56 overflow-auto text-[10px] leading-relaxed whitespace-pre-wrap">
          {prompt.digest}
        </pre>
      </details>
    </div>
  );
}
