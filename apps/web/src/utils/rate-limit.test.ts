import { afterEach, describe, expect, it, vi } from "vitest";

import { checkRateLimit, rateLimitResponse } from "./rate-limit";

describe("rate-limit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit", () => {
    const result = checkRateLimit("user-1", { limit: 3, windowMs: 60_000 });
    expect(result.allowed).toBe(true);
    expect(Number(result.headers["RateLimit-Remaining"])).toBe(2);
  });

  it("blocks requests over the limit", () => {
    const window = { limit: 2, windowMs: 60_000 };
    expect(checkRateLimit("user-2", window).allowed).toBe(true);
    expect(checkRateLimit("user-2", window).allowed).toBe(true);
    const blocked = checkRateLimit("user-2", window);
    expect(blocked.allowed).toBe(false);
    expect(Number(blocked.headers["RateLimit-Remaining"])).toBe(0);
  });

  it("resets the bucket after the window expires", () => {
    vi.useFakeTimers();
    const window = { limit: 1, windowMs: 60_000 };
    expect(checkRateLimit("user-3", window).allowed).toBe(true);
    expect(checkRateLimit("user-3", window).allowed).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(checkRateLimit("user-3", window).allowed).toBe(true);
  });

  it("produces a 429 response", () => {
    const response = rateLimitResponse({ "RateLimit-Limit": "5" });
    expect(response.status).toBe(429);
  });
});
