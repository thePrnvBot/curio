import { toUIMessage } from "@curio/api/domain/chat";
import type { ChatNotFound, ChatOperationFailed } from "@curio/api/domain/chat";
import type { ChatRunInFlight } from "@curio/api/domain/chat-run-in-flight";
import { ChatRunStore } from "@curio/api/services/chat-run-store";
import type {
  ChatRunExitStatus,
  ChatRunRecord,
  ChatRunStoreContract,
} from "@curio/api/services/chat-run-store";
import { ChatStore } from "@curio/api/services/chat-store";
import type { UIMessage, UIMessageChunk } from "ai";
import { createUIMessageStreamResponse } from "ai";
import { Data, Effect, Option, Stream } from "effect";
import { z } from "zod";

import { notifyRunChunk, waitForRunChunk } from "./run-chunk-notifier";
import { withSecurityHeaders } from "./security-headers";

/* ---------------------------------- tuning --------------------------------- */

/**
 * Idle fallback for a resuming client. The writer normally wakes the tail as
 * soon as it commits a batch; this timeout covers a remote or dead writer.
 */
const RESUME_POLL_TIMEOUT_MS = 1000;

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
  chatId: string,
  userId: string
): Effect.fn.Return<
  string,
  ChatOperationFailed | ChatRunInFlight | ChatNotFound,
  ChatRunStore
> {
  const chatRunStore = yield* ChatRunStore;
  return yield* chatRunStore.createRun(chatId, userId);
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
export function extractPartialAssistantMessage(
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
 * Persists the text a dead/interrupted run managed to commit before its
 * process stopped. Idempotent: an already-persisted message id is skipped.
 */
export const persistCommittedPartial = Effect.fnUntraced(
  function* persistRunPartial(
    runId: string,
    chatId: string,
    userId: string
  ): Effect.fn.Return<
    void,
    ChatNotFound | ChatOperationFailed,
    ChatStore | ChatRunStore
  > {
    const chatRunStore = yield* ChatRunStore;
    const chunks = yield* chatRunStore.listChunks(runId);
    const partialMessage = extractPartialAssistantMessage(chunks);
    if (partialMessage === null) {
      return;
    }

    const chatStore = yield* ChatStore;
    const messageRecords = yield* chatStore.listMessageRecords(chatId, userId);
    const alreadyPersisted = messageRecords.some(
      (record) => record.id === partialMessage.id
    );
    if (alreadyPersisted) {
      return;
    }
    yield* chatStore.replaceMessages(
      {
        chatId,
        messages: [...messageRecords.map(toUIMessage), partialMessage],
      },
      userId
    );
  }
);

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

  const runOption = yield* chatRunStore.getRun(runId);
  if (Option.isNone(runOption)) {
    // The run vanished; nothing to recover.
    return;
  }
  const run = runOption.value;
  if (run.status !== "running" || !isStaleRun(run)) {
    // Already finished elsewhere in between, or alive after all.
    return;
  }
  yield* chatRunStore.finishRun(runId, "crashed");

  yield* persistCommittedPartial(runId, staleRunChatId, userId);
});

/**
 * Recovers a run orphaned by a dead process before a new submit tries to
 * claim the chat. Without this, the partial unique index would answer 409 for
 * up to the staleness window after a crash.
 */
export const recoverStaleChatRun = Effect.fnUntraced(
  function* recoverStaleRunForChat(
    chatId: string,
    userId: string
  ): Effect.fn.Return<void, never, ChatRunStore | ChatStore> {
    const chatRunStore = yield* ChatRunStore;
    const foundOutcome = yield* Effect.result(
      chatRunStore.findRunningRun(chatId, userId)
    );
    if (foundOutcome._tag === "Failure") {
      yield* Effect.logError(
        "Failed to look up running chat run",
        chatId,
        foundOutcome.failure
      );
      return;
    }
    if (Option.isNone(foundOutcome.success)) {
      return;
    }
    const run = foundOutcome.success.value;
    if (!isStaleRun(run)) {
      return;
    }
    yield* recoverStaleRun(run, userId).pipe(
      Effect.catch((error) =>
        Effect.logError("Failed to recover stale chat run", error)
      )
    );
  }
);

/** Outcome of the chunk-commit writer: drives the terminal run status. */
export type CommitOutcome =
  | { readonly _tag: "ok" }
  | { readonly _tag: "commit-failed" }
  | { readonly _tag: "stream-failed"; readonly cause: unknown };

/** Folds a stream failure into the running commit outcome. */
export function foldStreamFailure(
  outcome: CommitOutcome,
  streamOutcome: { readonly _tag: "Failure"; readonly failure: unknown }
): CommitOutcome {
  if (outcome._tag === "ok") {
    return { _tag: "stream-failed", cause: streamOutcome.failure };
  }
  return outcome;
}

/** Resolves the terminal run status from the commit outcome and abort state. */
export function resolveRunEndStatus(
  outcome: CommitOutcome,
  wasAborted: boolean
): ChatRunExitStatus {
  switch (outcome._tag) {
    case "commit-failed":
    case "stream-failed": {
      return "error";
    }
    case "ok": {
      return wasAborted ? "stopped" : "done";
    }
    default: {
      return "error";
    }
  }
}

/**
 * The committed-chunk writer. Consumes one branch of the run's UI message
 * stream and commits its chunks into the run store in batches. Arrives as a
 * fiber via `runFork`, detached from the HTTP request, so disconnects never
 * stop the agent and the resume endpoint can replay what was committed.
 * Errors absorb the outcome as the run's exit status rather than failing.
 */
export const commitChatRunChunks = Effect.fn("durable-chat.commitChunks")(
  function* commitChunks({
    chatId,
    chunkStream,
    hasPersistenceFailure,
    runId,
    userId,
  }: {
    chatId: string;
    chunkStream: ReadableStream<UIMessageChunk>;
    /** The transcript persist hook runs in the stream's `onEnd`; a failure
     * there must make the run terminal status `error`, not `done`. */
    hasPersistenceFailure?: () => boolean;
    runId: string;
    userId: string;
  }): Effect.fn.Return<ChatRunExitStatus, never, ChatRunStore | ChatStore> {
    const chatRunStore = yield* ChatRunStore;
    let commitOutcome: CommitOutcome = { _tag: "ok" };

    const streamOutcome = yield* Effect.result(
      Stream.runForEach(
        Stream.fromReadableStream({
          evaluate: () => chunkStream,
          onError: (cause) => new ChatRunStreamFailed({ cause }),
          releaseLockOnEnd: true,
        }).pipe(Stream.groupedWithin(16, "100 millis")),
        (chunkBatch) =>
          Effect.gen(function* commitChunkBatch() {
            const appendOutcome = yield* Effect.result(
              chatRunStore.appendChunks(runId, chunkBatch)
            );
            if (appendOutcome._tag === "Failure") {
              commitOutcome = { _tag: "commit-failed" };
              yield* Effect.logError(
                "Failed to append chat run chunks",
                runId,
                appendOutcome.failure
              );
            } else {
              // Wake the resume tail only after the batch is durable.
              notifyRunChunk(runId);
            }
          })
      )
    );
    if (streamOutcome._tag === "Failure") {
      commitOutcome = foldStreamFailure(commitOutcome, streamOutcome);
      yield* Effect.logError(
        "Chat run chunk writer failed",
        runId,
        streamOutcome.failure
      );
    }

    if (commitOutcome._tag === "ok" && hasPersistenceFailure?.() === true) {
      commitOutcome = { _tag: "commit-failed" };
    }

    // The chat route's onAbort hook can land just after the stream settles;
    // give it a beat before deciding whether the user aborted the run.
    if (!abortedRunIds.has(runId)) {
      yield* Effect.sleep(STOP_LABEL_SETTLE);
    }
    const wasAborted = abortedRunIds.has(runId);
    if (wasAborted) {
      // The writer consumed the stream, so every committed delta (including
      // the step that was in flight when the user stopped) is in the chunk
      // log. Persist the text before the run leaves `running` so a reload
      // after the stop does not lose what the user already saw.
      yield* persistCommittedPartial(runId, chatId, userId).pipe(
        Effect.catch((partialError) =>
          Effect.logError(
            "Failed to persist the stopped run's committed partial",
            runId,
            partialError
          )
        )
      );
    }
    const endStatus = resolveRunEndStatus(commitOutcome, wasAborted);

    yield* chatRunStore
      .finishRun(runId, endStatus)
      .pipe(
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
  return Stream.paginate({ lastSeq: -1 }, (cursor) =>
    Effect.gen(function* pollCommittedChunks() {
      const runOutcome = yield* Effect.result(chatRunStore.getRun(runId));
      if (runOutcome._tag === "Failure") {
        return [
          [errorChunk(describeError(runOutcome.failure))],
          Option.none(),
        ] as const;
      }
      if (Option.isNone(runOutcome.success)) {
        return [
          [errorChunk("The agent run no longer exists")],
          Option.none(),
        ] as const;
      }
      const run = runOutcome.success.value;

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
      const committedChunksOnly = committedChunks.map((record) => record.chunk);

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
      // If the poll returned chunks, loop immediately; otherwise wait for the
      // writer's notification or the idle fallback.
      if (committedChunks.length === 0) {
        yield* Effect.promise((signal) =>
          waitForRunChunk(runId, RESUME_POLL_TIMEOUT_MS, signal)
        );
      }
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
export const resumeChatStreamResponse = Effect.fn("durable-chat.resume")(
  function* resumeFromCommittedChunks({
    chatId,
    userId,
  }: {
    chatId: string;
    userId: string;
  }): Effect.fn.Return<Response, never, ChatStore | ChatRunStore> {
    if (!chatIdSchema.safeParse(chatId).success) {
      return withSecurityHeaders(
        Response.json({ error: "Invalid chat id" }, { status: 400 })
      );
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
      return withSecurityHeaders(
        Response.json(
          { error: "Failed to look up the agent run" },
          { status: 500 }
        )
      );
    }
    const foundRun = foundRunOutcome.success;
    if (Option.isSome(foundRun) && isStaleRun(foundRun.value)) {
      yield* recoverStaleRun(foundRun.value, userId).pipe(
        Effect.catch((error) =>
          Effect.logError("Failed to recover stale chat run", error)
        )
      );
    }

    const activeRunOutcome = yield* Effect.result(
      chatRunStore.findRunningRun(chatId, userId)
    );
    if (activeRunOutcome._tag === "Failure") {
      return withSecurityHeaders(
        Response.json(
          { error: "Failed to look up the agent run" },
          { status: 500 }
        )
      );
    }
    const activeRun = activeRunOutcome.success;
    if (Option.isNone(activeRun)) {
      return withSecurityHeaders(new Response(null, { status: 204 }));
    }

    const replayStream = buildReplayStream(
      chatRunStore,
      activeRun.value.id,
      Date.now() + MAX_RESUME_TAIL_MS
    );
    return withSecurityHeaders(
      createUIMessageStreamResponse({
        stream: Stream.toReadableStream(replayStream),
      })
    );
  }
);

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
    const runOption = yield* chatRunStore
      .getRun(runId)
      .pipe(Effect.catch(() => Effect.succeed(Option.none<ChatRunRecord>())));
    if (Option.isNone(runOption)) {
      return latestStatus;
    }
    const run = runOption.value;
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
      return withSecurityHeaders(
        Response.json({ error: "Invalid chat id" }, { status: 400 })
      );
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
      return withSecurityHeaders(
        Response.json(
          { error: "Failed to look up the agent run" },
          { status: 500 }
        )
      );
    }
    const runningRun = runningRunOutcome.success;
    if (Option.isNone(runningRun)) {
      return withSecurityHeaders(
        Response.json(
          { error: "No active agent run for this chat" },
          { status: 404 }
        )
      );
    }
    const runId = runningRun.value.id;
    const abortController = activeRunAbortControllers.get(runId);
    if (abortController === undefined) {
      // The run predates this process or its process died; the resume
      // responder marks it crashed once stale, so there is nothing to abort.
      return withSecurityHeaders(
        Response.json({
          ok: true,
          runId,
          status: runningRun.value.status,
        })
      );
    }

    abortedRunIds.add(runId);
    abortController.abort();

    const settledStatus = yield* waitForRunEnd(chatRunStore, runId);
    return withSecurityHeaders(
      Response.json({ ok: true, runId, status: settledStatus })
    );
  }
);
