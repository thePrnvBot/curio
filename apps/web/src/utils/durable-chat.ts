import { toUIMessage } from "@curio/api/domain/chat";
import { ChatRunStore } from "@curio/api/services/chat-run-store";
import { ChatStore } from "@curio/api/services/chat-store";
import type {
  ChatRunExitStatus,
  ChatRunRecord,
  ChatRunStoreContract,
} from "@curio/api/services/chat-run-store";
import type { ChatNotFound } from "@curio/api/domain/chat-not-found";
import type { ChatOperationFailed } from "@curio/api/domain/chat-operation-failed";
import type { UIMessage, UIMessageChunk } from "ai";
import { createUIMessageStreamResponse } from "ai";
import { Data, Effect, Option, Stream } from "effect";
import { z } from "zod";

/* ---------------------------------- tuning --------------------------------- */

/** How often a resuming client polls for freshly committed chunks. */
const RESUME_POLL_INTERVAL = "200 millis";

/** A run the writer has not touched for this long is treated as crashed. */
const STALE_RUN_THRESHOLD_MS = 300_000;

/** Upper bound for an open tail; reconnecting restarts the tail later. */
const MAX_RESUME_TAIL_MS = 900_000;

/** How long an abort waits for the server run to settle before answering. */
const ABORT_SETTLE_TIMEOUT_MS = 8000;

/** Grace period for the onAbort hook to flag the run before the writer labels it. */
const STOP_LABEL_SETTLE = "300 millis";

const chatIdSchema = z.string().min(1).max(64);

export class ChatRunStreamFailed extends Data.TaggedError(
  "ChatRunStreamFailed"
)<{
  readonly cause: unknown;
}> {}

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const errorChunk = (errorText: string): UIMessageChunk => ({
  errorText,
  type: "error",
});

/* ------------------------------ process state ------------------------------ */

/**
 * AbortController per live run: the stop button aborts the server run, not
 * just the fetch. Run record keeping that is naturally per-process stays in
 * module scope; everything durable lives in the run store instead.
 */
const activeRunAbortControllers = new Map<string, AbortController>();

/**
 * Runs aborted through the abort endpoint. The committed-chunk writer labels
 * them `stopped` instead of `done` once their stream settles.
 */
const abortedRunIds = new Set<string>();

/** Clears the process handles of a finished, failed or interrupted run. */
export const releaseRunRegistration = (runId: string): Effect.Effect<void> =>
  Effect.sync(() => {
    activeRunAbortControllers.delete(runId);
    abortedRunIds.delete(runId);
  });

/** Registers the abort handle that the stop button reaches through the abort route. */
export function registerRunAbortController(
  runId: string,
  controller: AbortController
): void {
  activeRunAbortControllers.set(runId, controller);
}

/** Called by the chat route's `onAbort` hook when the user stops a run. */
export function markRunAborted(runId: string): void {
  abortedRunIds.add(runId);
}

/* --------------------------- run lifecycle effects --------------------------- */

/**
 * Admits a durable run in storage before any model output is shown. The run
 * exists from here on, so a client that reconnects replays committed chunks
 * instead of re-requesting the model.
 */
export const createDurableRun = Effect.fnUntraced(function* admitDurableRun(
  chatId: string
): Effect.fn.Return<string, ChatOperationFailed, ChatRunStore> {
  const chatRunStore = yield* ChatRunStore;
  return yield* chatRunStore.createRun(chatId);
});

/** Whether the chat still has an in-flight agent run (ownership-checked). */
export const chatRunInFlight = Effect.fnUntraced(function* findInFlightRun(
  chatId: string,
  userId: string
): Effect.fn.Return<ChatRunRecord | null, never, ChatRunStore> {
  const chatRunStore = yield* ChatRunStore;
  const outcome = yield* Effect.result(
    chatRunStore.findRunningRun(chatId, userId)
  );
  if (outcome._tag === "Failure") {
    // A lookup failure must not wedge the submit path; the run creation
    // that follows surfaces storage problems anyway.
    yield* Effect.logError(
      "Failed to look up running chat run",
      chatId,
      outcome.failure
    );
    return null;
  }
  return outcome.success;
});

function isStaleRun(run: ChatRunRecord): boolean {
  const lastTouchMs = Date.parse(run.updatedAt);
  if (Number.isNaN(lastTouchMs)) {
    return false;
  }
  return Date.now() - lastTouchMs > STALE_RUN_THRESHOLD_MS;
}

/**
 * Reassembles a text-only assistant message from committed stream chunks,
 * matching how aborted runs persist partials.
 */
function extractPartialAssistantMessage(
  chunks: readonly ChatRunRecordChunk[]
): { id: string; parts: UIMessage["parts"]; role: "assistant" } | null {
  const textParts = new Map<string, { text: string; type: "text" }>();
  let messageId: string | null = null;

  for (const { chunk } of chunks) {
    if (chunk.type === "start") {
      const { messageId: startMessageId } = chunk;
      if (typeof startMessageId === "string") {
        messageId = startMessageId;
      }
      continue;
    }
    if (chunk.type === "text-start") {
      textParts.set(chunk.id, { text: "", type: "text" });
      continue;
    }
    if (chunk.type === "text-delta") {
      const textPart = textParts.get(chunk.id);
      if (textPart !== undefined) {
        textPart.text += chunk.delta;
      }
    }
  }

  if (messageId === null || textParts.size === 0) {
    return null;
  }
  const partialText = [...textParts.values()]
    .map((textPart) => textPart.text)
    .join("")
    .trim();
  if (partialText === "") {
    return null;
  }
  return {
    id: messageId,
    parts: [{ text: partialText, type: "text" }],
    role: "assistant",
  };
}

interface ChatRunRecordChunk {
  readonly seq: number;
  readonly chunk: UIMessageChunk;
}

/**
 * Marks a stale run `crashed` (its process is gone) and persists the text it
 * produced so far, so the persisted transcript matches the replay.
 */
const recoverStaleRun = Effect.fnUntraced(function* markStaleRunCrashed(
  staleRun: ChatRunRecord,
  userId: string
): Effect.fn.Return<
  void,
  ChatNotFound | ChatOperationFailed,
  ChatStore | ChatRunStore
> {
  const chatRunStore = yield* ChatRunStore;
  const { chatId: staleRunChatId, id: runId } = staleRun;

  const run = yield* chatRunStore.getRun(runId);
  if (run === null || run.status !== "running" || !isStaleRun(run)) {
    // Already finished elsewhere in between, or alive after all.
    return;
  }
  yield* chatRunStore.finishRun(runId, "crashed");

  const chunks = yield* chatRunStore.listChunks(runId);
  const partialMessage = extractPartialAssistantMessage(chunks);
  if (partialMessage === null) {
    return;
  }

  yield* Effect.gen(function* persistCrashedPartial() {
    const chatStore = yield* ChatStore;
    const messageRecords = yield* chatStore.listMessageRecords(
      staleRunChatId,
      userId
    );
    const alreadyPersisted = messageRecords.some(
      (record) => record.id === partialMessage.id
    );
    if (alreadyPersisted) {
      return;
    }
    yield* chatStore.replaceMessages(
      {
        chatId: staleRunChatId,
        messages: [...messageRecords.map(toUIMessage), partialMessage],
      },
      userId
    );
  });
});

/**
 * The committed-chunk writer. Consumes one branch of the run's UI message
 * stream and commits its chunks into the run store in batches. Arrives as a
 * fiber via `runFork`, detached from the HTTP request, so disconnects never
 * stop the agent and the resume endpoint can replay what was committed.
 * Errors absorb the outcome as the run's exit status rather than failing.
 */
export const commitChatRunChunks = Effect.fn("durable-chat.commitChunks")(
  function* commitChunks({
    chunkStream,
    runId,
  }: {
    runId: string;
    chunkStream: ReadableStream<UIMessageChunk>;
  }): Effect.fn.Return<ChatRunExitStatus, never, ChatRunStore> {
    const chatRunStore = yield* ChatRunStore;
    let commitFailed = false;

    const streamOutcome = yield* Effect.result(
      Stream.runForEach(
        Stream.fromReadableStream({
          evaluate: () => chunkStream,
          onError: (cause) => new ChatRunStreamFailed({ cause }),
          releaseLockOnEnd: true,
        }).pipe(Stream.groupedWithin(16, "100 millis")),
        (chunkBatch) =>
          Effect.gen(function* commitChunkBatch() {
            const commitOutcome = yield* Effect.result(
              chatRunStore.appendChunks(runId, chunkBatch)
            );
            if (commitOutcome._tag === "Failure") {
              commitFailed = true;
              yield* Effect.logError(
                "Failed to append chat run chunks",
                runId,
                commitOutcome.failure
              );
            }
          })
      )
    );
    if (streamOutcome._tag === "Failure") {
      commitFailed = true;
      yield* Effect.logError(
        "Chat run chunk writer failed",
        runId,
        streamOutcome.failure
      );
    }

    // The chat route's onAbort hook can land just after the stream settles;
    // give it a beat before deciding whether the user aborted the run.
    if (!abortedRunIds.has(runId)) {
      yield* Effect.sleep(STOP_LABEL_SETTLE);
    }
    let endStatus: ChatRunExitStatus = "done";
    if (commitFailed) {
      endStatus = "error";
    } else if (abortedRunIds.has(runId)) {
      endStatus = "stopped";
    }

    yield* chatRunStore.finishRun(runId, endStatus).pipe(
      Effect.catch((error) =>
        Effect.logError("Failed to mark chat run end", runId, error)
      )
    );
    return endStatus;
  }
);

/**
 * The resume tail as an Effect Stream: each pull checks the run, returns the
 * newly committed chunks (possibly none), keeps polling while the run is
 * alive and stops once it settles, times out, or the store fails.
 */
function buildReplayStream(
  chatRunStore: ChatRunStoreContract,
  runId: string,
  deadlineMs: number
): Stream.Stream<UIMessageChunk> {
  // The cursor starts at -1: chunk seqs begin at 0, and `listChunks` is
  // exclusive of the cursor, so 0 here would silently drop the run's `start`
  // chunk. Without it the client never learns the assistant message id, and
  // every replay builds the response into a fresh local message instead of
  // replacing the existing one - duplicating the conversation per visit.
  return Stream.paginate(
    { lastSeq: -1 },
    (cursor) => Effect.gen(function* pollCommittedChunks() {
      const runOutcome = yield* Effect.result(chatRunStore.getRun(runId));
      if (runOutcome._tag === "Failure") {
        return [
          [errorChunk(describeError(runOutcome.failure))],
          Option.none(),
        ] as const;
      }
      const run = runOutcome.success;
      if (run === null) {
        return [
          [errorChunk("The agent run no longer exists")],
          Option.none(),
        ] as const;
      }

      const chunksOutcome = yield* Effect.result(
        chatRunStore.listChunks(runId, cursor.lastSeq)
      );
      if (chunksOutcome._tag === "Failure") {
        return [
          [errorChunk(describeError(chunksOutcome.failure))],
          Option.none(),
        ] as const;
      }
      const committedChunks = chunksOutcome.success;
      const lastSeq = committedChunks.at(-1)?.seq ?? cursor.lastSeq;
      const committedChunksOnly = committedChunks.map(
        (record) => record.chunk
      );

      if (run.status !== "running") {
        return [committedChunksOnly, Option.none()] as const;
      }
      if (Date.now() > deadlineMs) {
        return [
          [
            ...committedChunksOnly,
            errorChunk("Stopped tailing the agent run; reload to reconnect"),
          ],
          Option.none(),
        ] as const;
      }
      yield* Effect.sleep(RESUME_POLL_INTERVAL);
      return [committedChunksOnly, Option.some({ lastSeq })] as const;
    })
  );
}

/**
 * The resume responder: 204 when no agent run is active, otherwise an SSE
 * replay of committed chunks tailed with database polls until the run leaves
 * `running`. A stale run is marked `crashed` and its partial text is appended
 * to the persisted transcript first, which is how a dead process hands back
 * what it was working on.
 */
export const resumeChatStreamResponse = Effect.fn(
  "durable-chat.resume"
)(function* resumeFromCommittedChunks({
  chatId,
  userId,
}: {
  chatId: string;
  userId: string;
}): Effect.fn.Return<Response, never, ChatStore | ChatRunStore> {
  if (!chatIdSchema.safeParse(chatId).success) {
    return Response.json({ error: "Invalid chat id" }, { status: 400 });
  }

  const chatRunStore = yield* ChatRunStore;
  const foundRunOutcome = yield* Effect.result(
    chatRunStore.findRunningRun(chatId, userId)
  );
  if (foundRunOutcome._tag === "Failure") {
    yield* Effect.logError(
      "Failed to look up running chat run",
      chatId,
      foundRunOutcome.failure
    );
    return Response.json(
      { error: "Failed to look up the agent run" },
      { status: 500 }
    );
  }
  const foundRun = foundRunOutcome.success;
  if (foundRun !== null && isStaleRun(foundRun)) {
    yield* recoverStaleRun(foundRun, userId).pipe(
      Effect.catch((error) =>
        Effect.logError("Failed to recover stale chat run", error)
      )
    );
  }

  const activeRunOutcome = yield* Effect.result(
    chatRunStore.findRunningRun(chatId, userId)
  );
  if (activeRunOutcome._tag === "Failure") {
    return Response.json(
      { error: "Failed to look up the agent run" },
      { status: 500 }
    );
  }
  const activeRun = activeRunOutcome.success;
  if (activeRun === null) {
    return new Response(null, { status: 204 });
  }

  const replayStream = buildReplayStream(
    chatRunStore,
    activeRun.id,
    Date.now() + MAX_RESUME_TAIL_MS
  );
  return createUIMessageStreamResponse({
    stream: Stream.toReadableStream(replayStream),
  });
});

/**
 * Settles an abort: polls the run store until the run leaves `running` (the
 * chunk writer marks it stopped after its stream ends) or the deadline passes.
 */
const waitForRunEnd = Effect.fnUntraced(function* waitForRunSettle(
  chatRunStore: ChatRunStoreContract,
  runId: string
): Effect.fn.Return<ChatRunRecord["status"]> {
  const deadline = Date.now() + ABORT_SETTLE_TIMEOUT_MS;
  let latestStatus: ChatRunRecord["status"] = "running";
  for (;;) {
    const run = yield* chatRunStore.getRun(runId).pipe(
      Effect.catch(() => Effect.succeed(null))
    );
    if (run === null) {
      return latestStatus;
    }
    latestStatus = run.status;
    if (run.status !== "running" || Date.now() >= deadline) {
      return run.status;
    }
    yield* Effect.sleep("100 millis");
  }
});

/**
 * The abort responder: stops the server-side agent run through its
 * AbortController and waits for the run to settle, then reports the final
 * status. 404 when nothing is running; a claim-free view for runs whose
 * process died (the resume responder recovers those once stale).
 */
export const abortChatRunResponse = Effect.fn("durable-chat.abort")(
  function* abortInFlightRun({
    chatId,
    userId,
  }: {
    chatId: string;
    userId: string;
  }): Effect.fn.Return<Response, never, ChatRunStore> {
    if (!chatIdSchema.safeParse(chatId).success) {
      return Response.json({ error: "Invalid chat id" }, { status: 400 });
    }

    const chatRunStore = yield* ChatRunStore;
    const runningRunOutcome = yield* Effect.result(
      chatRunStore.findRunningRun(chatId, userId)
    );
    if (runningRunOutcome._tag === "Failure") {
      yield* Effect.logError(
        "Failed to look up running chat run",
        chatId,
        runningRunOutcome.failure
      );
      return Response.json(
        { error: "Failed to look up the agent run" },
        { status: 500 }
      );
    }
    const runningRun = runningRunOutcome.success;
    if (runningRun === null) {
      return Response.json(
        { error: "No active agent run for this chat" },
        { status: 404 }
      );
    }
    const runId = runningRun.id;
    const abortController = activeRunAbortControllers.get(runId);
    if (abortController === undefined) {
      // The run predates this process or its process died; the resume
      // responder marks it crashed once stale, so there is nothing to abort.
      return Response.json({ ok: true, runId, status: runningRun.status });
    }

    abortedRunIds.add(runId);
    abortController.abort();

    const settledStatus = yield* waitForRunEnd(chatRunStore, runId);
    return Response.json({ ok: true, runId, status: settledStatus });
  }
);
