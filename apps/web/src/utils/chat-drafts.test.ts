import { describe, expect, it } from "vitest";

import {
  composerDraftKey,
  readComposerDraft,
  writeComposerDraft,
} from "./chat-drafts";
import type { DraftStorage } from "./chat-drafts";

function memoryStorage(initial: Record<string, string> = {}): DraftStorage & {
  readonly entries: Map<string, string>;
} {
  const entries = new Map(Object.entries(initial));
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    removeItem: (key) => {
      entries.delete(key);
    },
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
}

describe("composer drafts", () => {
  it("round-trips a draft under a prefixed key", () => {
    const storage = memoryStorage();
    writeComposerDraft("chat-1", "Explain recursion with a drawing", storage);

    expect(readComposerDraft("chat-1", storage)).toBe(
      "Explain recursion with a drawing"
    );
    expect(storage.entries.get(composerDraftKey("chat-1"))).toBe(
      "Explain recursion with a drawing"
    );
  });

  it("keeps drafts isolated per conversation", () => {
    const storage = memoryStorage();
    writeComposerDraft("chat-1", "first", storage);
    writeComposerDraft("chat-2", "second", storage);

    expect(readComposerDraft("chat-1", storage)).toBe("first");
    expect(readComposerDraft("chat-2", storage)).toBe("second");
    expect(readComposerDraft("chat-3", storage)).toBe("");
  });

  it("clears the entry when the draft is emptied", () => {
    const storage = memoryStorage();
    writeComposerDraft("chat-1", "half-written", storage);
    writeComposerDraft("chat-1", "", storage);

    expect(storage.entries.has(composerDraftKey("chat-1"))).toBe(false);
    expect(readComposerDraft("chat-1", storage)).toBe("");
  });

  it("clamps oversized drafts instead of failing", () => {
    const storage = memoryStorage();
    writeComposerDraft("chat-1", "x".repeat(20_000), storage);

    expect(readComposerDraft("chat-1", storage)).toHaveLength(16_000);
  });

  it("degrades to an empty draft when storage throws", () => {
    const storage: DraftStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        // No-op: only the throwing read/write paths matter here.
      },
      setItem: () => {
        throw new Error("quota");
      },
    };

    expect(readComposerDraft("chat-1", storage)).toBe("");
    expect(() => {
      writeComposerDraft("chat-1", "text", storage);
    }).not.toThrow();
  });

  it("treats a missing storage object as an empty draft", () => {
    expect(readComposerDraft("chat-1", null)).toBe("");
    expect(() => {
      writeComposerDraft("chat-1", "text", null);
    }).not.toThrow();
  });
});
