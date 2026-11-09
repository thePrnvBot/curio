import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

/** Per-user guidance for the Director: learning style, pacing, tone, depth and
 * study strategies. Absence of a row means "no custom instructions". Stored
 * separately from the model-provider settings so clearing a custom provider
 * never wipes the learner's preferences. */
export const userLearningPreferences = pgTable("user_learning_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  customInstructions: text("custom_instructions").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
