import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

/** Structured content shown in the center pane of a course lesson page.
 * One variant per lesson kind; the UI renders each variant differently. */
export interface VideoLessonContent {
  readonly kind: "video";
  /** Teaching prose shown alongside the video slot. */
  readonly body: string;
  /** Optional embeddable video URL (YouTube link or direct video file). */
  readonly videoUrl?: string;
}

export interface CardLessonContent {
  readonly kind: "cards";
  /** Optionally introduce the cards above the deck. */
  readonly body?: string;
  readonly cards: readonly { readonly title: string; readonly body: string }[];
}

export interface AnimationLessonContent {
  readonly kind: "animation";
  /** Prose explaining what the animation demonstrates. */
  readonly body: string;
  /** Self-contained HTML document rendered in a sandboxed iframe. */
  readonly html: string;
}

export interface RecapExercise {
  readonly prompt: string;
  readonly options: readonly string[];
  /** Zero-based index of the correct option. */
  readonly answerIndex: number;
  readonly explanation?: string;
}

export interface RecapLessonContent {
  readonly kind: "recap";
  readonly questions: readonly RecapExercise[];
}

export type LessonContent =
  | VideoLessonContent
  | CardLessonContent
  | AnimationLessonContent
  | RecapLessonContent;

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

/** Sidebar headings in the course page: lessons are grouped beneath them. */
export const courseSection = pgTable(
  "course_section",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => course.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("course_section_courseId_idx").on(table.courseId)]
);

export const courseLesson = pgTable(
  "course_lesson",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => course.id, { onDelete: "cascade" }),
    // Lessons created before sections existed are grouped into an implicit
    // first section by the course detail reader (null sectionId).
    sectionId: text("section_id").references(() => courseSection.id, {
      onDelete: "cascade",
    }),
    // 1-based display order within its section
    position: integer("position").notNull(),
    // "video" | "cards" | "animation" | "recap"
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    content: jsonb("content").$type<LessonContent>(),
    completedAt: timestamp("completed_at"),
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
    earnedAt: timestamp("earned_at").defaultNow().notNull(),
  },
  (table) => [index("course_badge_userId_idx").on(table.userId)]
);
