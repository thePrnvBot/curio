import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const course = pgTable(
  "course",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    // "active" until the user finishes or discards it
    status: text("status").notNull().default("active"),
    lessonCount: integer("lesson_count").notNull().default(0),
    completedLessonCount: integer("completed_lesson_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("course_userId_idx").on(table.userId)]
);

export const courseLesson = pgTable(
  "course_lesson",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => course.id, { onDelete: "cascade" }),
    // 1-based display order within the course
    position: integer("position").notNull(),
    // "video" | "cards" | "animation" | "recap"
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("course_lesson_courseId_idx").on(table.courseId)]
);

export const courseBadge = pgTable(
  "course_badge",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: text("course_id").references(() => course.id, {
      onDelete: "set null",
    }),
    label: text("label").notNull(),
    earnedAt: timestamp("earned_at")
      .defaultNow()
      .notNull(),
  },
  (table) => [index("course_badge_userId_idx").on(table.userId)]
);
