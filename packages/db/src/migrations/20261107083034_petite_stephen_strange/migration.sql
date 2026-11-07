CREATE TABLE "chat_run" (
	"id" text PRIMARY KEY,
	"chat_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_run_chunk" (
	"id" serial PRIMARY KEY,
	"run_id" text NOT NULL,
	"seq" integer NOT NULL,
	"chunk" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"lesson_count" integer DEFAULT 0 NOT NULL,
	"completed_lesson_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_badge" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"course_id" text,
	"label" text NOT NULL,
	"earned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_lesson" (
	"id" text PRIMARY KEY,
	"course_id" text NOT NULL,
	"section_id" text,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"content" jsonb,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_section" (
	"id" text PRIMARY KEY,
	"course_id" text NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_model_settings" (
	"user_id" text PRIMARY KEY,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"base_url" text,
	"api_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "chat_run_chatId_idx" ON "chat_run" ("chat_id");--> statement-breakpoint
CREATE INDEX "chat_run_chunk_runId_seq_idx" ON "chat_run_chunk" ("run_id","seq");--> statement-breakpoint
CREATE INDEX "course_userId_idx" ON "course" ("user_id");--> statement-breakpoint
CREATE INDEX "course_badge_userId_idx" ON "course_badge" ("user_id");--> statement-breakpoint
CREATE INDEX "course_lesson_courseId_idx" ON "course_lesson" ("course_id");--> statement-breakpoint
CREATE INDEX "course_section_courseId_idx" ON "course_section" ("course_id");--> statement-breakpoint
CREATE INDEX "user_model_settings_userId_idx" ON "user_model_settings" ("user_id");--> statement-breakpoint
ALTER TABLE "chat_run" ADD CONSTRAINT "chat_run_chat_id_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chat"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_run_chunk" ADD CONSTRAINT "chat_run_chunk_run_id_chat_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "chat_run"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "course_badge" ADD CONSTRAINT "course_badge_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "course_badge" ADD CONSTRAINT "course_badge_course_id_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "course_lesson" ADD CONSTRAINT "course_lesson_course_id_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "course_lesson" ADD CONSTRAINT "course_lesson_section_id_course_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "course_section"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "course_section" ADD CONSTRAINT "course_section_course_id_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_model_settings" ADD CONSTRAINT "user_model_settings_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;