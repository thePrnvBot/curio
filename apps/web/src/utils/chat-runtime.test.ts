import { describe, expect, it, vi } from "vitest";

import {
  getStreamingChatsSnapshot,
  markChatIdle,
  markChatStreaming,
  subscribeToChatActivity,
  subscribeToNewChat,
} from "./chat-runtime";

describe("chat activity store", () => {
  it("emits once when the same streaming title is reported repeatedly", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToChatActivity(listener);

    markChatStreaming("chat-a", "Learning Rust");
    markChatStreaming("chat-a", "Learning Rust");
    markChatStreaming("chat-a", "Learning Rust");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getStreamingChatsSnapshot()).toEqual([
      { chatId: "chat-a", streaming: true, title: "Learning Rust" },
    ]);

    markChatIdle("chat-a");
    expect(getStreamingChatsSnapshot()).toEqual([]);
    unsubscribe();
  });

  it("defaults an empty title to a readable label", () => {
    markChatStreaming("chat-b", "");
    expect(getStreamingChatsSnapshot()[0]?.title).toBe("Untitled chat");
    markChatIdle("chat-b");
  });

  it("signals a fresh chat without navigation", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToNewChat(listener);
    window.dispatchEvent(new Event("curio:new-chat"));
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    window.dispatchEvent(new Event("curio:new-chat"));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
