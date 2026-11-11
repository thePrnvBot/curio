import { useSyncExternalStore, useEffect, useRef } from "react";

import { RabbitHoleWindow } from "@/components/rabbit-hole/rabbit-hole-window";
import {
  closeRabbitHole,
  getOpenRabbitHole,
  openRabbitHole,
  subscribeToRabbitHole,
} from "@/utils/rabbit-hole-ui";

/**
 * Mounted once per conversation. Owns whichever Rabbit Hole is open and gives
 * the window access to the chat's send function, so the wrap-up can hand the
 * digest back to the Director as a normal turn.
 */
export function RabbitHoleHost({
  chatId,
  onSendPrompt,
}: {
  chatId: string;
  onSendPrompt: (prompt: string) => void;
}) {
  const openSessionId = useSyncExternalStore(
    subscribeToRabbitHole,
    getOpenRabbitHole,
    () => null
  );
  const reattachAttemptedRef = useRef(false);

  // A reload keeps the server-side browser alive; reattach to it instead of
  // stranding an invisible session.
  useEffect(() => {
    if (reattachAttemptedRef.current || openSessionId !== null) {
      return;
    }
    reattachAttemptedRef.current = true;
    let cancelled = false;

    async function reattach(): Promise<void> {
      try {
        const response = await fetch(
          `/api/rabbit-hole/active?chatId=${encodeURIComponent(chatId)}`,
          { credentials: "include" }
        );
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as {
          sessionId: string | null;
        };
        if (!cancelled && payload.sessionId !== null) {
          openRabbitHole(payload.sessionId);
        }
      } catch {
        // No live session to reattach to.
      }
    }

    void reattach();
    return () => {
      cancelled = true;
    };
  }, [chatId, openSessionId]);

  if (openSessionId === null) {
    return null;
  }

  return (
    <RabbitHoleWindow
      key={openSessionId}
      onClose={closeRabbitHole}
      onSendPrompt={onSendPrompt}
      sessionId={openSessionId}
    />
  );
}
