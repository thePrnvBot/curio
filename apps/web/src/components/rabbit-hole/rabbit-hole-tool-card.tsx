import {
  Tool,
  ToolContent,
  ToolHeader,
} from "@curio/ui/components/ai-elements/tool";
import { Button } from "@curio/ui/components/button";
import type { ToolUIPart } from "ai";
import { Option } from "effect";
import { RabbitIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { toStartRabbitHoleOutput } from "@/utils/chat-schemas";
import { openRabbitHole, takeRabbitHoleAutoOpen } from "@/utils/rabbit-hole-ui";

/**
 * The Director's summon card. A live session opens the overlay automatically
 * once per streamed call; the button remains for reopening after the learner
 * closes it. The existence check keeps restored transcripts from reopening a
 * session that was already discarded.
 */
export function RabbitHoleToolCard({ part }: { part: ToolUIPart }) {
  const output =
    part.state === "output-available"
      ? toStartRabbitHoleOutput(part.output)
      : Option.none();
  const view = Option.getOrNull(output);
  const sessionId = Option.getOrNull(view?.sessionId ?? Option.none());
  const isReady = view?.status === "ready" && sessionId !== null;
  const [alive, setAlive] = useState<boolean | null>(null);

  useEffect(() => {
    if (sessionId === null) {
      return;
    }
    const id: string = sessionId;
    let cancelled = false;

    async function checkSession(): Promise<void> {
      try {
        const response = await fetch(
          `/api/rabbit-hole/${encodeURIComponent(id)}`,
          { credentials: "include" }
        );
        if (cancelled) {
          return;
        }
        setAlive(response.ok);
        if (response.ok && takeRabbitHoleAutoOpen(id)) {
          openRabbitHole(id);
        }
      } catch {
        if (!cancelled) {
          setAlive(false);
        }
      }
    }

    void checkSession();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <Tool defaultOpen={false} key={part.toolCallId}>
      <ToolHeader state={part.state} title="Rabbit Hole" type={part.type} />
      <ToolContent>
        {view === null ? (
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            <RabbitIcon className="size-3.5 animate-pulse" />
            Summoning a disposable browser session…
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs">{view.message}</p>
            {isReady && alive === true && (
              <Button
                onClick={() => {
                  if (sessionId !== null) {
                    openRabbitHole(sessionId);
                  }
                }}
                size="sm"
                variant="outline"
              >
                <RabbitIcon data-icon="inline-start" />
                Open Rabbit Hole
              </Button>
            )}
            {isReady && alive === false && (
              <p className="text-muted-foreground text-xs">
                This session has ended and its raw trail was discarded.
              </p>
            )}
            {!isReady && (
              <p className="text-destructive flex items-start gap-1.5 text-xs">
                <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
                Rabbit Hole is unavailable on this machine.
              </p>
            )}
          </div>
        )}
      </ToolContent>
    </Tool>
  );
}
