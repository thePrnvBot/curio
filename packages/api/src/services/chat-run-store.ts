import type { UIMessageChunk } from "ai";
import type { Effect, Option } from "effect";
import { Context } from "effect";

import type { ChatOperationFailed } from "../domain/chat";

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

/**
 * Storage for durable chat agent runs. Every stream chunk is committed here
 * before a viewer sees it, so a client that reconnects replays the same
 * transcript the model produced and the run leaves an audit trail in the
 * database.
 */
export interface ChatRunStoreContract {
  /** Admits a new running run for a chat before generation starts. */
  readonly createRun: (
    chatId: string
  ) => Effect.Effect<string, ChatOperationFailed>;

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

  /** One run by id. */
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
   * longer than the staleness window are marked `crashed` and their ids are
   * returned for partial-message recovery.
   */
  readonly crashStaleRuns: (
    stalenessMs: number
  ) => Effect.Effect<readonly string[], ChatOperationFailed>;
}

export class ChatRunStore extends Context.Service<
  ChatRunStore,
  ChatRunStoreContract
>()("curio/ChatRunStore") {}
