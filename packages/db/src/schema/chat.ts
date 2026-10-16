import type { UIMessage } from "ai";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const chat = pgTable(
  "chat",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull().default("New chat"),
    isArchived: boolean("is_archived").default(false).notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("chat_userId_idx").on(table.userId)]
);

export const chatMessage = pgTable(
  "chat_message",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    parts: jsonb("parts").$type<UIMessage["parts"]>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("chat_message_chatId_idx").on(table.chatId)]
);

/**
 * Durable agent runs: one row per generation started for a chat. The run
 * exists in storage before any model output is shown, so a client that
 * reopens the conversation mid-run replays the committed stream instead of
 * re-requesting the model. A run leaves "running" only when its writer has
 * flushed the final chunk (`done` after a full answer, `stopped` when the
 * user aborts, `error` on failure, `crashed` when a stalled run was marked
 * so after a server restart).
 */
export const chatRun = pgTable(
  "chat_run",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("running"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("chat_run_chatId_idx").on(table.chatId)]
);

/**
 * Committed stream chunks of one run, numbered in order. Tool-call and text
 * chunks land here before they are shown, which is what makes the transcript
 * reproducible after a disconnect.
 */
export const chatRunChunk = pgTable(
  "chat_run_chunk",
  {
    id: serial("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => chatRun.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    chunk: jsonb("chunk").$type<Record<string, unknown>>().notNull(),
  },
  (table) => [index("chat_run_chunk_runId_seq_idx").on(table.runId, table.seq)]
);
