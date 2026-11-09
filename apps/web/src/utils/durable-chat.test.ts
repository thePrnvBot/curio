import type { UIMessageChunk } from "ai";
import { describe, expect, it } from "vitest";

import type { CommitOutcome } from "./durable-chat";
import {
  extractPartialAssistantMessage,
  foldStreamFailure,
  resolveRunEndStatus,
} from "./durable-chat";

const committed = (...chunks: UIMessageChunk[]) =>
  chunks.map((chunk, seq) => ({ chunk, seq }));

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
