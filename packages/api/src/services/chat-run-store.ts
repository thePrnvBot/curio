import type { UIMessageChunk } from "ai";
import type { Effect, Option } from "effect";
import { Context } from "effect";

import type { ChatNotFound, ChatOperationFailed } from "../domain/chat";
import type { ChatRunInFlight } from "../domain/chat-run-in-flight";

export type ChatRunStatus =
  | "running"
  | "done"
  | "stopped"
  | "error"
  | "crashed";

export type ChatRunExitStatus = Exclude<ChatRunStatus, "running">;

export interface ChatRunRecord {
  readonly id: string;
  readonly chatId: string;
  readonly status: ChatRunStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ChatRunChunkRecord {
  readonly seq: number;
  readonly chunk: UIMessageChunk;
}

/** A stale run recovered at boot, with the owner needed for transcript writes. */
export interface CrashedChatRun {
  readonly chatId: string;
  readonly id: string;
  readonly userId: string;
}

/**
 * Storage for durable chat agent runs. Every stream chunk is committed here
 * before a viewer sees it, so a client that reconnects replays the same
 * transcript the model produced and the run leaves an audit trail in the
 * database.
 */
export interface ChatRunStoreContract {
  /**
   * Atomically admits a new running run for a chat the user owns. Fails with
   * `ChatRunInFlight` when another run is already running: the partial unique
   * index in the database is the arbiter, so concurrent submits cannot both
   * start generation.
   */
  readonly createRun: (
    chatId: string,
    userId: string
  ) => Effect.Effect<
    string,
    ChatOperationFailed | ChatRunInFlight | ChatNotFound
  >;

  /** Commits whole-chunk output for a run; also keeps the run fresh. */
  readonly appendChunks: (
    runId: string,
    chunks: readonly UIMessageChunk[]
  ) => Effect.Effect<void, ChatOperationFailed>;

  /** Marks the run terminal (`done`, `stopped`, `error` or `crashed`). */
  readonly finishRun: (
    runId: string,
    status: ChatRunExitStatus
  ) => Effect.Effect<void, ChatOperationFailed>;

  /** The currently running run for a chat, if one exists. */
  readonly findRunningRun: (
    chatId: string,
    userId: string
  ) => Effect.Effect<Option.Option<ChatRunRecord>, ChatOperationFailed>;

  /** One run by id. Internal callers only; routes must scope by user first
   * through `findRunningRun`. */
  readonly getRun: (
    runId: string
  ) => Effect.Effect<Option.Option<ChatRunRecord>, ChatOperationFailed>;

  /** Committed chunks of a run, ordered, after the given sequence number. */
  readonly listChunks: (
    runId: string,
    afterSeq?: number
  ) => Effect.Effect<readonly ChatRunChunkRecord[], ChatOperationFailed>;

  /**
   * Runs whose process died mid-generation: running runs untouched for
   * longer than the staleness window are marked `crashed` and returned so
   * their committed partial text can be persisted.
   */
  readonly crashStaleRuns: (
    stalenessMs: number
  ) => Effect.Effect<readonly CrashedChatRun[], ChatOperationFailed>;
}

export class ChatRunStore extends Context.Service<
  ChatRunStore,
  ChatRunStoreContract
>()("curio/ChatRunStore") {}
