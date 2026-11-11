/**
 * Tiny external store for the Rabbit Hole overlay. The chat tool card opens a
 * session; the host (mounted once per conversation) renders it. Keeping this
 * outside React means a streamed tool result can open the window without
 * threading callbacks through every message row.
 */

let openSessionId: string | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function openRabbitHole(sessionId: string): void {
  if (openSessionId === sessionId) {
    return;
  }
  openSessionId = sessionId;
  emit();
}

export function closeRabbitHole(): void {
  if (openSessionId === null) {
    return;
  }
  openSessionId = null;
  emit();
}

export function getOpenRabbitHole(): string | null {
  return openSessionId;
}

export function subscribeToRabbitHole(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const AUTO_OPEN_KEY_PREFIX = "curio:rabbit-hole-auto-opened:";

/**
 * Each streamed session may auto-open the window exactly once. The marker
 * lives in sessionStorage so reloading the transcript (which restores old
 * tool parts) does not reopen a dead session.
 */
export function takeRabbitHoleAutoOpen(sessionId: string): boolean {
  try {
    const key = `${AUTO_OPEN_KEY_PREFIX}${sessionId}`;
    if (window.sessionStorage.getItem(key) === "1") {
      return false;
    }
    window.sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}
