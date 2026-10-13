import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

/** Per-user chat model choice. Empty rows (absence of a row) mean "use the
 * server's default provider from the environment". */
export const userModelSettings = pgTable(
  "user_model_settings",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    /** "openai" uses the official OpenAI provider; "openai-compatible" talks
     * chat-completions at a user-specified base URL (GLM, Kimi, DeepSeek...). */
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    /** Required for openai-compatible; ignored for openai. */
    baseUrl: text("base_url"),
    /** Personal API key; when null the web app falls back to the server
     * environment key. */
    apiKey: text("api_key"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("user_model_settings_userId_idx").on(table.userId)]
);
