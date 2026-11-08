import type { Database } from "@curio/db";
import { chat, chatRun, chatRunChunk } from "@curio/db/schema/chat";
import { and, asc, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { Effect, Option } from "effect";

import { ChatOperationFailed, ChatNotFound } from "../domain/chat";
import { ChatRunInFlight } from "../domain/chat-run-in-flight";
import type {
  ChatRunChunkRecord,
  ChatRunRecord,
  ChatRunStatus,
  ChatRunStoreContract,
  CrashedChatRun,
} from "../services/chat-run-store";

const CHAT_RUN_STATUSES = [
  "running",
  "done",
  "stopped",
  "error",
  "crashed",
] as const satisfies readonly ChatRunStatus[];

/** DB text is untrusted; an out-of-contract status degrades to `error`
 * instead of leaking the raw string or crashing the run lookup. */
function decodeRunStatus(status: string): ChatRunStatus {
  return CHAT_RUN_STATUSES.find((candidate) => candidate === status) ?? "error";
}

function toStoreError(operation: string) {
  return (cause: unknown): ChatOperationFailed =>
    new ChatOperationFailed({ cause, operation });
}

function withStoreError(operation: string) {
  return <Success>(
    effect: Effect.Effect<Success, unknown, never>
  ): Effect.Effect<Success, ChatOperationFailed, never> =>
    Effect.mapError(effect, toStoreError(operation));
}

function rowToRunRecord(row: {
  readonly id: string;
  readonly chatId: string;
  readonly status: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}): ChatRunRecord {
  return {
    chatId: row.chatId,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    status: decodeRunStatus(row.status),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const RUN_ID_PREFIX = "run";

export function createDrizzleChatRunStore(
  database: Database
): ChatRunStoreContract {
  return {
    createRun: (chatId, userId) =>
      withStoreError("createRun")(
        Effect.gen(function* admitRun() {
          const ownedChatRows = yield* Effect.tryPromise(() =>
            database
              .select({ id: chat.id })
              .from(chat)
              .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
              .limit(1)
          );
          if (ownedChatRows.at(0) === undefined) {
            return yield* Effect.fail(new ChatNotFound({ chatId }));
          }

          const runId = `${RUN_ID_PREFIX}-${crypto.randomUUID()}`;
          // The partial unique index on `(chatId) WHERE status = 'running'`
          // rejects a concurrent second run; no check-then-act gap remains.
          const insertedRows = yield* Effect.tryPromise(() =>
            database
              .insert(chatRun)
              .values({ chatId, id: runId })
              .onConflictDoNothing()
              .returning({ id: chatRun.id })
          );
          if (insertedRows.at(0) === undefined) {
            return yield* Effect.fail(new ChatRunInFlight({ chatId }));
          }
          return runId;
        })
      ),

    appendChunks: (runId, chunks) =>
      withStoreError("appendChunks")(
        Effect.tryPromise(async () => {
          if (chunks.length === 0) {
            return;
          }
          await database.transaction(async (transactionDatabase) => {
            const highestRows = await transactionDatabase
              .select({ seq: chatRunChunk.seq })
              .from(chatRunChunk)
              .where(eq(chatRunChunk.runId, runId))
              .orderBy(desc(chatRunChunk.seq))
              .limit(1);
            const baseSeq = highestRows.at(0)?.seq ?? -1;
            await transactionDatabase.insert(chatRunChunk).values(
              chunks.map((chunk, offset) => ({
                chunk,
                runId,
                seq: baseSeq + offset + 1,
              }))
            );
            // Touch the run so a live writer is never mistaken for a dead one.
            await transactionDatabase
              .update(chatRun)
              .set({ updatedAt: new Date() })
              .where(eq(chatRun.id, runId));
          });
        })
      ),

    finishRun: (runId, status) =>
      withStoreError("finishRun")(
        Effect.tryPromise(() =>
          database
            .update(chatRun)
            .set({ status })
            .where(and(eq(chatRun.id, runId), eq(chatRun.status, "running")))
        ).pipe(Effect.asVoid)
      ),

    findRunningRun: (chatId, userId) =>
      withStoreError("findRunningRun")(
        Effect.tryPromise(() =>
          database
            .select({
              id: chatRun.id,
              chatId: chatRun.chatId,
              status: chatRun.status,
              createdAt: chatRun.createdAt,
              updatedAt: chatRun.updatedAt,
            })
            .from(chatRun)
            .innerJoin(chat, eq(chatRun.chatId, chat.id))
            .where(
              and(
                eq(chatRun.chatId, chatId),
                eq(chat.id, chatId),
                eq(chat.userId, userId),
                eq(chatRun.status, "running")
              )
            )
            .orderBy(desc(chatRun.createdAt))
            .limit(1)
        )
      ).pipe(
        Effect.map((rows) =>
          Option.fromNullishOr(rows.at(0)).pipe(Option.map(rowToRunRecord))
        )
      ),

    getRun: (runId) =>
      withStoreError("getRun")(
        Effect.tryPromise(() =>
          database
            .select({
              id: chatRun.id,
              chatId: chatRun.chatId,
              status: chatRun.status,
              createdAt: chatRun.createdAt,
              updatedAt: chatRun.updatedAt,
            })
            .from(chatRun)
            .where(eq(chatRun.id, runId))
            .limit(1)
        )
      ).pipe(
        Effect.map((rows) =>
          Option.fromNullishOr(rows.at(0)).pipe(Option.map(rowToRunRecord))
        )
      ),

    listChunks: (runId, afterSeq) =>
      withStoreError("listChunks")(
        Effect.tryPromise(() =>
          database
            .select({
              seq: chatRunChunk.seq,
              chunk: chatRunChunk.chunk,
            })
            .from(chatRunChunk)
            .where(
              afterSeq === undefined
                ? eq(chatRunChunk.runId, runId)
                : and(
                    eq(chatRunChunk.runId, runId),
                    gt(chatRunChunk.seq, afterSeq)
                  )
            )
            .orderBy(asc(chatRunChunk.seq))
        )
      ).pipe(
        Effect.map((rows): ChatRunChunkRecord[] =>
          rows.map((row) => ({
            chunk: row.chunk,
            seq: row.seq,
          }))
        )
      ),

    crashStaleRuns: (stalenessMs) =>
      withStoreError("crashStaleRuns")(
        Effect.tryPromise(async (): Promise<CrashedChatRun[]> => {
          const staleCutoff = new Date(Date.now() - stalenessMs);
          const staleRuns = await database
            .update(chatRun)
            .set({ status: "crashed" })
            .where(
              and(
                eq(chatRun.status, "running"),
                lt(chatRun.updatedAt, staleCutoff)
              )
            )
            .returning({ chatId: chatRun.chatId, id: chatRun.id });
          if (staleRuns.length === 0) {
            return [];
          }
          const owners = await database
            .select({ chatId: chat.id, userId: chat.userId })
            .from(chat)
            .where(
              inArray(
                chat.id,
                staleRuns.map((staleRun) => staleRun.chatId)
              )
            );
          const ownerByChatId = new Map(
            owners.map((owner) => [owner.chatId, owner.userId])
          );
          return staleRuns.flatMap((staleRun) => {
            const userId = ownerByChatId.get(staleRun.chatId);
            return userId === undefined
              ? []
              : [{ chatId: staleRun.chatId, id: staleRun.id, userId }];
          });
        })
      ),
  };
}
