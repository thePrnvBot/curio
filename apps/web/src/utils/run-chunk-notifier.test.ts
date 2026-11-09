import { afterEach, describe, expect, it, vi } from "vitest";

import {
  notifyRunChunk,
  pendingRunChunkWaiterCount,
  waitForRunChunk,
} from "./run-chunk-notifier";

describe("run-chunk-notifier", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves a waiting promise when the run is notified", async () => {
    const waited = waitForRunChunk("run-1", 5000);
    expect(pendingRunChunkWaiterCount("run-1")).toBe(1);

    notifyRunChunk("run-1");

    await expect(waited).resolves.toBeUndefined();
    expect(pendingRunChunkWaiterCount("run-1")).toBe(0);
  });

  it("resolves after the timeout when no notification arrives", async () => {
    vi.useFakeTimers();
    const waited = waitForRunChunk("run-2", 1000);

    await vi.advanceTimersByTimeAsync(999);
    expect(pendingRunChunkWaiterCount("run-2")).toBe(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(waited).resolves.toBeUndefined();
  });

  it("resolves every waiter for the same run", async () => {
    const first = waitForRunChunk("run-3", 5000);
    const second = waitForRunChunk("run-3", 5000);
    expect(pendingRunChunkWaiterCount("run-3")).toBe(2);

    notifyRunChunk("run-3");

    await expect(Promise.all([first, second])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    expect(pendingRunChunkWaiterCount("run-3")).toBe(0);
  });

  it("ignores a notification for a different run", async () => {
    vi.useFakeTimers();
    let resolved = false;
    const waited = waitForRunChunk("run-4", 1000).then(() => {
      resolved = true;
    });

    notifyRunChunk("run-other");
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(false);
    expect(pendingRunChunkWaiterCount("run-4")).toBe(1);

    notifyRunChunk("run-4");
    await waited;
    expect(resolved).toBe(true);
  });

  it("removes a timed-out waiter from the map", async () => {
    vi.useFakeTimers();
    const waited = waitForRunChunk("run-5", 1000);

    await vi.advanceTimersByTimeAsync(1000);
    await waited;

    expect(pendingRunChunkWaiterCount("run-5")).toBe(0);
    // Notifying an empty run is a no-op rather than a stale callback.
    notifyRunChunk("run-5");
    expect(pendingRunChunkWaiterCount("run-5")).toBe(0);
  });

  it("removes the waiter when its signal aborts", async () => {
    const controller = new AbortController();
    const waited = waitForRunChunk("run-6", 5000, controller.signal);
    expect(pendingRunChunkWaiterCount("run-6")).toBe(1);

    controller.abort();

    await expect(waited).resolves.toBeUndefined();
    expect(pendingRunChunkWaiterCount("run-6")).toBe(0);
  });
});
