/**
 * In-process wake-up for a run's chunk tail. The writer notifies after a
 * committed batch; the tail waits for a notification with a timeout, so a
 * crashed or remote writer still falls back to polling.
 *
 * Process-local by design: the documented deployment is a single long-lived
 * Node process. A multi-instance deployment must keep the polling fallback
 * (or replace this with a shared pub/sub).
 */
const waiters = new Map<string, Set<() => void>>();

/** Wakes every tail currently waiting for this run's chunks. */
export function notifyRunChunk(runId: string): void {
  const listeners = waiters.get(runId);
  if (listeners === undefined) {
    return;
  }
  waiters.delete(runId);
  for (const resolve of listeners) {
    resolve();
  }
}

/**
 * Resolves when the run is notified or after `timeoutMs`, whichever comes
 * first. An optional abort signal cleans the waiter up immediately when the
 * consuming stream is interrupted (for example, the client disconnected).
 */
export function waitForRunChunk(
  runId: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<void> {
  // A deferred notification has no library equivalent: the promise settles
  // later from `notifyRunChunk`, the timeout, or an abort.
  // oxlint-disable-next-line promise/avoid-new
  return new Promise((resolve) => {
    let settled = false;
    const pending: { timer?: ReturnType<typeof setTimeout> } = {};
    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (pending.timer !== undefined) {
        clearTimeout(pending.timer);
      }
      signal?.removeEventListener("abort", finish);
      const listeners = waiters.get(runId);
      listeners?.delete(finish);
      if (listeners?.size === 0) {
        waiters.delete(runId);
      }
      resolve();
    };

    if (signal?.aborted === true) {
      finish();
      return;
    }
    pending.timer = setTimeout(finish, timeoutMs);
    signal?.addEventListener("abort", finish, { once: true });
    const listeners = waiters.get(runId) ?? new Set<() => void>();
    listeners.add(finish);
    waiters.set(runId, listeners);
  });
}

/** Number of tails currently waiting on a run; used by tests to catch leaks. */
export function pendingRunChunkWaiterCount(runId: string): number {
  return waiters.get(runId)?.size ?? 0;
}
