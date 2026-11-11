import { buildRabbitHoleDigest } from "./digest";
import { RabbitHoleProxySession } from "./proxy-session";
import type { RabbitHoleDigestResult, RabbitHoleEvent } from "./types";
import { createRabbitHoleId } from "./types";

/**
 * In-memory registry for live Rabbit Hole sessions. Sessions are ephemeral by
 * design: the trail and the raw page captures never touch the database, and
 * are dropped once the digest exists.
 *
 * The registry hangs off `globalThis` so the chat tool and the HTTP routes
 * share one instance even if the bundler gives each entry point its own copy
 * of this module (notably during Vite's dev reloads).
 */

const MAX_SESSION_MS = 45 * 60_000;
const PURGE_AFTER_END_MS = 30 * 60_000;

export interface StoredRabbitHoleSession {
  readonly browser: RabbitHoleProxySession;
  readonly chatId: string;
  readonly createdAt: number;
  readonly userId: string;
  digest: RabbitHoleDigestResult | null;
  /** Model-polished digest, cached after the first end request. */
  enhancedDigest: string | null;
  endedAt: number | null;
  purgeTimer: ReturnType<typeof setTimeout> | null;
  watchdog: ReturnType<typeof setTimeout> | null;
}

interface SessionRegistry {
  readonly sessions: Map<string, StoredRabbitHoleSession>;
}

const REGISTRY_KEY = Symbol.for("curio.rabbit-hole.sessions");
const globalStore = globalThis as unknown as Record<
  symbol,
  SessionRegistry | undefined
>;
const registry: SessionRegistry = globalStore[REGISTRY_KEY] ?? {
  sessions: new Map(),
};
globalStore[REGISTRY_KEY] = registry;

export interface OpenRabbitHoleOptions {
  readonly chatId: string;
  readonly seedUrls: readonly string[];
  readonly topic: string | null;
  readonly userId: string;
}

/** Best-effort expiry/purge: a timer must never surface an unhandled rejection. */
async function runQuietly(task: () => unknown): Promise<void> {
  try {
    await Promise.resolve(task());
  } catch {
    // Expiry and purge are background housekeeping.
  }
}

export function getRabbitHoleSession(
  sessionId: string,
  userId?: string
): StoredRabbitHoleSession | null {
  const session = registry.sessions.get(sessionId);
  if (session === undefined) {
    return null;
  }
  if (userId !== undefined && session.userId !== userId) {
    return null;
  }
  return session;
}

export function findActiveRabbitHoleForChat(
  chatId: string,
  userId: string
): StoredRabbitHoleSession | null {
  for (const session of registry.sessions.values()) {
    if (
      session.chatId === chatId &&
      session.userId === userId &&
      session.endedAt === null
    ) {
      return session;
    }
  }
  return null;
}

/** Ends the session and forgets the trail. */
export function purgeRabbitHoleSession(sessionId: string): void {
  const session = registry.sessions.get(sessionId);
  if (session === undefined) {
    return;
  }
  registry.sessions.delete(sessionId);
  if (session.watchdog !== null) {
    clearTimeout(session.watchdog);
  }
  if (session.purgeTimer !== null) {
    clearTimeout(session.purgeTimer);
  }
  try {
    session.browser.close();
  } catch {
    // Nothing left to clean up.
  }
}

/** Stops capture and freezes the digest; safe to call more than once. */
export function endRabbitHoleSession(
  sessionId: string
): RabbitHoleDigestResult | null {
  const session = registry.sessions.get(sessionId);
  if (session === undefined) {
    return null;
  }
  if (session.digest !== null) {
    return session.digest;
  }

  try {
    session.browser.end();
  } catch {
    // A failed end still has a trail worth digesting.
  }
  const endedAt = session.browser.getState().endedAt ?? Date.now();
  session.endedAt = endedAt;
  if (session.watchdog !== null) {
    clearTimeout(session.watchdog);
    session.watchdog = null;
  }

  session.digest = buildRabbitHoleDigest({
    endedAt,
    highlights: session.browser.getHighlights(),
    notes: session.browser.getNotes(),
    startedAt: session.browser.startedAt,
    topic: session.browser.topic,
    visits: session.browser.getVisits(),
  });

  const purgeTimer = setTimeout(() => {
    void runQuietly(() => purgeRabbitHoleSession(sessionId));
  }, PURGE_AFTER_END_MS);
  purgeTimer.unref?.();
  session.purgeTimer = purgeTimer;

  return session.digest;
}

/** Opens a session, replacing any session already running for this chat. */
export function openRabbitHoleSession(
  options: OpenRabbitHoleOptions
): StoredRabbitHoleSession {
  const existing = findActiveRabbitHoleForChat(options.chatId, options.userId);
  if (existing !== null) {
    purgeRabbitHoleSession(existing.browser.id);
  }

  const id = createRabbitHoleId();
  const browser = RabbitHoleProxySession.open({
    chatId: options.chatId,
    id,
    seedUrls: options.seedUrls,
    topic: options.topic,
  });

  const watchdog = setTimeout(() => {
    void runQuietly(() => endRabbitHoleSession(id));
  }, MAX_SESSION_MS);
  watchdog.unref?.();

  const session: StoredRabbitHoleSession = {
    browser,
    chatId: options.chatId,
    createdAt: Date.now(),
    digest: null,
    endedAt: null,
    enhancedDigest: null,
    purgeTimer: null,
    userId: options.userId,
    watchdog,
  };

  registry.sessions.set(id, session);
  return session;
}

/** Lets the end route stream live updates without importing the session type. */
export function subscribeToRabbitHoleSession(
  sessionId: string,
  listener: (event: RabbitHoleEvent) => void
): (() => void) | null {
  const session = registry.sessions.get(sessionId);
  if (session === undefined) {
    return null;
  }
  return session.browser.subscribe(listener);
}

export function rabbitHoleSessionCount(): number {
  return registry.sessions.size;
}
