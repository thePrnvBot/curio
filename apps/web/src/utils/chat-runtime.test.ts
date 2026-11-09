import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getChatInstance,
  getStreamingChatsSnapshot,
  markChatIdle,
  markChatStreaming,
  resetChatRuntime,
  subscribeToChatActivity,
  subscribeToNewChat,
} from "./chat-runtime";

vi.mock("@ai-sdk/react", () => ({
  Chat: class MockChat {
    readonly id: string;

    constructor({ id }: { id: string }) {
      this.id = id;
    }
  },
}));

afterEach(() => {
  resetChatRuntime();
});

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

describe("resetChatRuntime", () => {
  it("drops cached chat instances", () => {
    const first = getChatInstance("chat-a", []);
    resetChatRuntime();
    const second = getChatInstance("chat-a", []);
    expect(second).not.toBe(first);
  });

  it("clears streaming activity without dropping subscribers", () => {
    markChatStreaming("chat-a", "Learning Rust");
    const listener = vi.fn();
    const unsubscribe = subscribeToChatActivity(listener);

    resetChatRuntime();

    expect(getStreamingChatsSnapshot()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(1);

    markChatStreaming("chat-a", "Learning Go");
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getStreamingChatsSnapshot()).toEqual([
      { chatId: "chat-a", streaming: true, title: "Learning Go" },
    ]);

    unsubscribe();
  });
});
