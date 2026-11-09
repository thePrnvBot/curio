import type {
  ChatMessageRecord,
  StoredConversationMessages,
} from "@curio/api/domain/chat";
import type {
  ChatRunChunkRecord,
  ChatRunExitStatus,
  ChatRunRecord,
  ChatRunStoreContract,
} from "@curio/api/services/chat-run-store";
import { ChatRunStore } from "@curio/api/services/chat-run-store";
import type { ChatStoreContract } from "@curio/api/services/chat-store";
import { ChatStore } from "@curio/api/services/chat-store";
import type { UIMessageChunk } from "ai";
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";

import type { CommitOutcome } from "./durable-chat";
import {
  extractPartialAssistantMessage,
  foldStreamFailure,
  recoverStaleChatRun,
  resolveRunEndStatus,
} from "./durable-chat";

const committed = (...chunks: UIMessageChunk[]) =>
  chunks.map((chunk, seq) => ({ chunk, seq }));

const USER_MESSAGE: ChatMessageRecord = {
  createdAt: "2026-11-09T00:00:00.000Z",
  id: "user-1",
  parts: [{ text: "Hello", type: "text" }],
  role: "user",
};

const RECOVERED_MESSAGE: ChatMessageRecord = {
  createdAt: "2026-11-09T00:00:01.000Z",
  id: "assistant-1",
  parts: [{ text: "Recovered partial", type: "text" }],
  role: "assistant",
};

const COMMITTED_CHUNKS: readonly ChatRunChunkRecord[] = [
  { chunk: { messageId: "assistant-1", type: "start" }, seq: 1 },
  { chunk: { id: "text-1", type: "text-start" }, seq: 2 },
  {
    chunk: { delta: "Recovered partial", id: "text-1", type: "text-delta" },
    seq: 3,
  },
];

function makeStaleRun(): ChatRunRecord {
  const staleAt = new Date(Date.now() - 10 * 60_000).toISOString();
  return {
    chatId: "chat-1",
    createdAt: staleAt,
    id: "run-1",
    status: "running",
    updatedAt: staleAt,
  };
}

function createRecoveryStores(
  initialMessages: readonly ChatMessageRecord[] = [USER_MESSAGE]
) {
  let run: ChatRunRecord | null = makeStaleRun();
  let messageRecords = [...initialMessages];
  const replacedConversations: {
    conversation: StoredConversationMessages;
    userId: string;
  }[] = [];
  const finishedRuns: { runId: string; status: ChatRunExitStatus }[] = [];

  const chatRunStore: ChatRunStoreContract = {
    appendChunks: () => Effect.void,
    createRun: () => Effect.die("createRun is not used by recovery"),
    crashStaleRuns: () => Effect.succeed([]),
    findRunningRun: () =>
      Effect.succeed(run === null ? Option.none() : Option.some(run)),
    finishRun: (runId, status) => {
      finishedRuns.push({ runId, status });
      if (run !== null) {
        run = { ...run, status };
      }
      return Effect.void;
    },
    getRun: (runId) =>
      Effect.succeed(
        run !== null && run.id === runId ? Option.some(run) : Option.none()
      ),
    listChunks: () => Effect.succeed(COMMITTED_CHUNKS),
  };

  const chatStore: ChatStoreContract = {
    appendMessage: () => Effect.void,
    createChat: () => Effect.die("createChat is not used by recovery"),
    deleteChat: () => Effect.void,
    ensureChatForUser: () => Effect.void,
    getChat: () => Effect.die("getChat is not used by recovery"),
    listChats: () => Effect.succeed([]),
    listMessageRecords: () => Effect.succeed(messageRecords),
    renameChat: () => Effect.die("renameChat is not used by recovery"),
    replaceMessages: (conversation, userId) => {
      replacedConversations.push({ conversation, userId });
      messageRecords = conversation.messages.map((message) => ({
        ...message,
        createdAt: RECOVERED_MESSAGE.createdAt,
      }));
      return Effect.void;
    },
    setMessageTitle: () => Effect.void,
  };

  return {
    chatRunStore,
    chatStore,
    finishedRuns,
    replacedConversations,
  };
}

const recover = (stores: ReturnType<typeof createRecoveryStores>) =>
  Effect.runPromise(
    recoverStaleChatRun("chat-1", "user-1").pipe(
      Effect.provideService(ChatRunStore, stores.chatRunStore),
      Effect.provideService(ChatStore, stores.chatStore)
    )
  );

describe("recoverStaleChatRun", () => {
  it("persists the crashed run's partial into the transcript", async () => {
    const stores = createRecoveryStores();

    await recover(stores);

    expect(stores.finishedRuns).toEqual([
      { runId: "run-1", status: "crashed" },
    ]);
    expect(stores.replacedConversations).toHaveLength(1);
    expect(stores.replacedConversations[0]?.userId).toBe("user-1");
    expect(stores.replacedConversations[0]?.conversation).toEqual({
      chatId: "chat-1",
      messages: [
        {
          id: "user-1",
          parts: [{ text: "Hello", type: "text" }],
          role: "user",
        },
        {
          id: "assistant-1",
          parts: [{ text: "Recovered partial", type: "text" }],
          role: "assistant",
        },
      ],
    });
  });

  it("does not recover the same run twice", async () => {
    const stores = createRecoveryStores();

    await recover(stores);
    await recover(stores);

    expect(stores.finishedRuns).toHaveLength(1);
    expect(stores.replacedConversations).toHaveLength(1);
  });

  it("does not duplicate a partial that is already persisted", async () => {
    const stores = createRecoveryStores([USER_MESSAGE, RECOVERED_MESSAGE]);

    await recover(stores);

    expect(stores.finishedRuns).toEqual([
      { runId: "run-1", status: "crashed" },
    ]);
    expect(stores.replacedConversations).toHaveLength(0);
  });
});

describe("extractPartialAssistantMessage", () => {
  it("aggregates multiple text parts in order into one assistant message", () => {
    const message = extractPartialAssistantMessage(
      committed(
        { messageId: "msg-1", type: "start" },
        { id: "text-1", type: "text-start" },
        { delta: "Hello", id: "text-1", type: "text-delta" },
        { id: "text-1", type: "text-end" },
        { id: "text-2", type: "text-start" },
        { delta: " world", id: "text-2", type: "text-delta" },
        { id: "text-2", type: "text-end" }
      )
    );

    expect(message).toEqual({
      id: "msg-1",
      parts: [{ text: "Hello world", type: "text" }],
      role: "assistant",
    });
  });

  it("uses the start chunk's message id as the persisted message id", () => {
    const message = extractPartialAssistantMessage(
      committed(
        { type: "start-step" },
        { messageId: "stream-message-id", type: "start" },
        { id: "text-1", type: "text-start" },
        { delta: "Partial", id: "text-1", type: "text-delta" }
      )
    );

    expect(message?.id).toBe("stream-message-id");
  });

  it("returns null when the stream never declared a message id", () => {
    const message = extractPartialAssistantMessage(
      committed(
        { id: "text-1", type: "text-start" },
        { delta: "Text without a start id", id: "text-1", type: "text-delta" }
      )
    );

    expect(message).toBeNull();
  });

  it("returns null when no text arrived", () => {
    const message = extractPartialAssistantMessage(
      committed({ messageId: "msg-1", type: "start" })
    );

    expect(message).toBeNull();
  });

  it("returns null when the text is only whitespace", () => {
    const message = extractPartialAssistantMessage(
      committed(
        { messageId: "msg-1", type: "start" },
        { id: "text-1", type: "text-start" },
        { delta: "  \n\t ", id: "text-1", type: "text-delta" }
      )
    );

    expect(message).toBeNull();
  });

  it("ignores a delta that arrives before its text-start", () => {
    const message = extractPartialAssistantMessage(
      committed(
        { messageId: "msg-1", type: "start" },
        { delta: "orphan", id: "text-1", type: "text-delta" },
        { id: "text-1", type: "text-start" },
        { delta: " kept", id: "text-1", type: "text-delta" }
      )
    );

    expect(message?.parts).toEqual([{ text: "kept", type: "text" }]);
  });

  it("does not include tool chunks in the text output", () => {
    const message = extractPartialAssistantMessage(
      committed(
        { messageId: "msg-1", type: "start" },
        { id: "text-1", type: "text-start" },
        { delta: "Before tool", id: "text-1", type: "text-delta" },
        {
          toolCallId: "call-1",
          toolName: "create_lesson",
          type: "tool-input-start",
        },
        {
          input: { title: "Lesson" },
          toolCallId: "call-1",
          toolName: "create_lesson",
          type: "tool-input-available",
        },
        {
          output: { lessonId: "lesson-1" },
          toolCallId: "call-1",
          type: "tool-output-available",
        },
        { delta: " after tool", id: "text-1", type: "text-delta" }
      )
    );

    expect(message?.parts).toEqual([
      { text: "Before tool after tool", type: "text" },
    ]);
  });
});

describe("foldStreamFailure", () => {
  it("turns ok into stream-failed", () => {
    const outcome = foldStreamFailure(
      { _tag: "ok" },
      { _tag: "Failure", failure: "boom" }
    );
    expect(outcome).toEqual({ _tag: "stream-failed", cause: "boom" });
  });

  it("preserves commit-failed over stream failure", () => {
    const outcome = foldStreamFailure(
      { _tag: "commit-failed" },
      { _tag: "Failure", failure: "boom" }
    );
    expect(outcome).toEqual({ _tag: "commit-failed" });
  });

  it("preserves stream-failed over another stream failure", () => {
    const firstFailure: CommitOutcome = {
      _tag: "stream-failed",
      cause: "first",
    };
    const outcome = foldStreamFailure(firstFailure, {
      _tag: "Failure",
      failure: "second",
    });
    expect(outcome).toBe(firstFailure);
  });
});

describe("resolveRunEndStatus", () => {
  it("returns done when the commit succeeded and the run was not aborted", () => {
    expect(resolveRunEndStatus({ _tag: "ok" }, false)).toBe("done");
  });

  it("returns stopped when the commit succeeded but the run was aborted", () => {
    expect(resolveRunEndStatus({ _tag: "ok" }, true)).toBe("stopped");
  });

  it("returns error for a commit failure regardless of abort", () => {
    expect(resolveRunEndStatus({ _tag: "commit-failed" }, false)).toBe("error");
    expect(resolveRunEndStatus({ _tag: "commit-failed" }, true)).toBe("error");
  });

  it("returns error for a stream failure regardless of abort", () => {
    expect(
      resolveRunEndStatus({ _tag: "stream-failed", cause: "boom" }, false)
    ).toBe("error");
    expect(
      resolveRunEndStatus({ _tag: "stream-failed", cause: "boom" }, true)
    ).toBe("error");
  });
});
