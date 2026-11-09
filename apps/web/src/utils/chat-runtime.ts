import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";

/**
 * Chat instances live OUTSIDE the React tree so streams keep running when
 * the user navigates to another conversation - remounting with the same
 * chat id reattaches to the identical instance, in-flight stream included.
 */

const instances = new Map<string, Chat<UIMessage>>();
const stoppedChatIds = new Set<string>();
const resumeAttempts = new Map<string, number>();
const RESUME_DELAYS_MS = [1500, 4000, 8000] as const;

/** Marks a deliberate stop so the error path does not auto-reconnect it. */
export function markChatStopped(chatId: string): void {
  stoppedChatIds.add(chatId);
}

/** Clears the stop marker when a new user turn starts. */
export function clearChatStopped(chatId: string): void {
  stoppedChatIds.delete(chatId);
}

/**
 * A durable chat replays the whole active run from storage on reconnect
 * (GET /api/chat/{id}/stream). Telling the AI SDK that reconnection is a
 * full replay makes it reset the streaming message state first, so replayed
 * chunks rebuild the response instead of duplicating partial text.
 */
class ReplayDefaultChatTransport extends DefaultChatTransport<UIMessage> {
  readonly resumeStreamIsReplay = true;
}

function createTransport(): DefaultChatTransport<UIMessage> {
  return new ReplayDefaultChatTransport({
    api: "/api/chat",
    credentials: "include",
    prepareSendMessagesRequest: ({ id, messages, messageId, trigger }) => ({
      body: {
        id,
        messageId,
        trigger,
        message: messages.at(-1),
      },
    }),
  });
}

/* ------------------------------- new chat signal ----------------------------- */

const NEW_CHAT_EVENT = "curio:new-chat";

/** Starts a fresh conversation on the `/chat` route without a reload. */
export function requestNewChat(): void {
  window.dispatchEvent(new Event(NEW_CHAT_EVENT));
}

export function subscribeToNewChat(listener: () => void): () => void {
  window.addEventListener(NEW_CHAT_EVENT, listener);
  return () => {
    window.removeEventListener(NEW_CHAT_EVENT, listener);
  };
}

/* ------------------------------- finish events ------------------------------- */

const finishListeners = new Set<(chatId: string) => void>();

/** Fired when any instance's stream finishes (finish, abort or error) - even
 * while no chat component is subscribed to that instance. */
export function subscribeToChatFinish(
  listener: (chatId: string) => void
): () => void {
  finishListeners.add(listener);
  return () => {
    finishListeners.delete(listener);
  };
}

function emitFinish(chatId: string): void {
  for (const listener of finishListeners) {
    listener(chatId);
  }
}

/* ---------------------------------- activity --------------------------------- */

export interface ActiveChatActivity {
  readonly chatId: string;
  readonly streaming: boolean;
  readonly title: string;
}

const activity = new Map<string, ActiveChatActivity>();
const activityListeners = new Set<() => void>();

/** Snapshot must be referentially stable between store changes or
 * useSyncExternalStore re-renders forever (maximum update depth). */
const EMPTY_STREAMING_SNAPSHOT: readonly ActiveChatActivity[] = [];
let streamingSnapshot: readonly ActiveChatActivity[] = EMPTY_STREAMING_SNAPSHOT;
let streamingSnapshotDirty = true;

function emitActivityChange(): void {
  streamingSnapshotDirty = true;
  for (const listener of activityListeners) {
    listener();
  }
}

export function subscribeToChatActivity(listener: () => void): () => void {
  activityListeners.add(listener);
  return () => {
    activityListeners.delete(listener);
  };
}

/** Snapshot consumed through React's useSyncExternalStore. Rebuilt only when
 * the activity store changed since the previous call. */
export function getStreamingChatsSnapshot(): readonly ActiveChatActivity[] {
  if (streamingSnapshotDirty) {
    streamingSnapshot = [...activity.values()].filter(
      (entry) => entry.streaming
    );
    streamingSnapshotDirty = false;
  }
  return streamingSnapshot;
}

export function markChatStreaming(chatId: string, title: string): void {
  const streaming = true;
  const nextTitle = title === "" ? "Untitled chat" : title;
  const existing = activity.get(chatId);
  if (
    existing !== undefined &&
    existing.streaming === streaming &&
    existing.title === nextTitle
  ) {
    // Called once per token by a watching component; emitting every time
    // would rebuild the sidebar snapshot and re-render it per token.
    return;
  }
  activity.set(chatId, { chatId, streaming, title: nextTitle });
  emitActivityChange();
}

export function markChatIdle(chatId: string): void {
  const existing = activity.get(chatId);
  if (existing === undefined) {
    return;
  }
  activity.delete(chatId);
  emitActivityChange();
}

/**
 * Drops every user-scoped chat instance and marker. Call on sign-out or when
 * the authenticated user changes; component subscriptions are left intact so
 * their existing cleanup can run.
 */
export function resetChatRuntime(): void {
  instances.clear();
  stoppedChatIds.clear();
  resumeAttempts.clear();
  activity.clear();
  emitActivityChange();
}

const MAX_CACHED_CHAT_INSTANCES = 20;

export function getChatInstance(
  chatId: string,
  seedMessages?: readonly UIMessage[]
): Chat<UIMessage> {
  const existing = instances.get(chatId);
  if (existing !== undefined) {
    // The instance carries newer state than any server snapshot (an
    // in-flight or recently finished stream); never re-seed it.
    return existing;
  }
  if (instances.size >= MAX_CACHED_CHAT_INSTANCES) {
    const evictable = [...instances.keys()].find(
      (candidateChatId) => activity.get(candidateChatId)?.streaming !== true
    );
    if (evictable !== undefined) {
      instances.delete(evictable);
    }
  }
  const created = new Chat({
    id: chatId,
    messages: seedMessages ? [...seedMessages] : [],
    transport: createTransport(),
    onFinish: () => {
      stoppedChatIds.delete(chatId);
      resumeAttempts.delete(chatId);
      markChatIdle(chatId);
      emitFinish(chatId);
    },
    onError: () => {
      const wasStopped = stoppedChatIds.delete(chatId);
      markChatIdle(chatId);
      emitFinish(chatId);
      if (wasStopped) {
        return;
      }
      // The run is detached from the request: a dropped connection must
      // reconnect to the committed replay instead of surfacing a dead chat.
      // Bounded so a persistent 4xx/5xx cannot loop forever.
      const attempt = (resumeAttempts.get(chatId) ?? 0) + 1;
      if (attempt > RESUME_DELAYS_MS.length) {
        return;
      }
      resumeAttempts.set(chatId, attempt);
      const delayMs = RESUME_DELAYS_MS[attempt - 1] ?? 8000;
      const instance = instances.get(chatId);
      if (instance === undefined) {
        return;
      }
      window.setTimeout(() => {
        void (async () => {
          if (stoppedChatIds.has(chatId)) {
            return;
          }
          instance.clearError();
          try {
            await instance.resumeStream();
          } catch {
            // A failed resume keeps the local transcript; the next mount
            // retries through `useChat({ resume: true })`.
          }
        })();
      }, delayMs);
    },
  });
  instances.set(chatId, created);
  return created;
}

/* ---------------------------- instance event wiring --------------------------- */

/** Lightweight title for the activity indicator: first user message. */
export function titleFromMessages(messages: readonly UIMessage[]): string {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const firstTextPart = firstUserMessage?.parts.find(
    (part) => part.type === "text"
  );
  if (firstTextPart?.type !== "text") {
    return "Untitled chat";
  }
  const rawTitle = firstTextPart.text.trim().replaceAll(/\s+/gu, " ");
  if (rawTitle === "") {
    return "Untitled chat";
  }
  return rawTitle.length <= 48 ? rawTitle : `${rawTitle.slice(0, 45)}...`;
}
