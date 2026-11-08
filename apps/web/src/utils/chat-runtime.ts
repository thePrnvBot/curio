import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";

/**
 * Chat instances live OUTSIDE the React tree so streams keep running when
 * the user navigates to another conversation - remounting with the same
 * chat id reattaches to the identical instance, in-flight stream included.
 */

const instances = new Map<string, Chat<UIMessage>>();

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
  const nextEntry: ActiveChatActivity = {
    chatId,
    streaming,
    title: title === "" ? "Untitled chat" : title,
  };
  activity.set(chatId, nextEntry);
  emitActivityChange();
}

export function markChatIdle(chatId: string): void {
  const existing = activity.get(chatId);
  if (existing === undefined) {
    return;
  }
  activity.delete(chatId);
  emitActivityChange();
  emitFinish(chatId);
}

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
  const created = new Chat({
    id: chatId,
    messages: seedMessages ? [...seedMessages] : [],
    transport: createTransport(),
    onFinish: () => {
      markChatIdle(chatId);
      emitFinish(chatId);
    },
    onError: () => {
      markChatIdle(chatId);
      emitFinish(chatId);
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
