/**
 * Lightweight sliding-window rate limiter for server routes.
 *
 * In production with multiple server instances you should swap this for a
 * shared store (Redis, Postgres, or an edge KV). The local map is acceptable
 * for a single-node deployment and keeps the failure path simple.
 */

export interface RateLimitWindow {
  /** Maximum number of requests allowed in the window. */
  readonly limit: number;
  /** Window size in milliseconds. */
  readonly windowMs: number;
}

interface BucketEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, BucketEntry>();
let nextPruneAt = 0;
const PRUNE_INTERVAL_MS = 60_000;

function pruneExpired(now: number): void {
  if (now < nextPruneAt) {
    return;
  }
  nextPruneAt = now + PRUNE_INTERVAL_MS;
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

/** Check whether a request is allowed and return headers for the client. */
export function checkRateLimit(
  key: string,
  { limit, windowMs }: RateLimitWindow
): { allowed: boolean; headers: Record<string, string> } {
  const now = Date.now();
  pruneExpired(now);

  const existing = buckets.get(key);
  if (existing === undefined || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      headers: {
        "RateLimit-Limit": String(limit),
        "RateLimit-Remaining": String(limit - 1),
        "RateLimit-Reset": String(Math.ceil((now + windowMs) / 1000)),
      },
    };
  }

  const remaining = Math.max(0, limit - existing.count);
  const allowed = existing.count < limit;
  if (allowed) {
    existing.count += 1;
  }

  return {
    allowed,
    headers: {
      "RateLimit-Limit": String(limit),
      "RateLimit-Remaining": String(Math.max(0, remaining - 1)),
      "RateLimit-Reset": String(Math.ceil(existing.resetAt / 1000)),
    },
  };
}

export function rateLimitResponse(headers: Record<string, string>): Response {
  const reset = headers["RateLimit-Reset"];
  const resetSeconds = reset === undefined ? Number.NaN : Number(reset);
  const retryAfter = Number.isFinite(resetSeconds)
    ? String(Math.max(1, resetSeconds - Math.floor(Date.now() / 1000)))
    : undefined;
  return Response.json(
    { error: "Rate limit exceeded. Please slow down." },
    {
      headers: {
        ...headers,
        ...(retryAfter === undefined ? {} : { "Retry-After": retryAfter }),
      },
      status: 429,
    }
  );
}
