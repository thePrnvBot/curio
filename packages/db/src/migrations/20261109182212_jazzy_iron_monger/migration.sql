CREATE TABLE "user_learning_preferences" (
	"user_id" text PRIMARY KEY,
	"custom_instructions" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "chat_run_one_running_per_chat_idx" ON "chat_run" ("chat_id") WHERE "status" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "course_badge_user_course_idx" ON "course_badge" ("user_id","course_id");--> statement-breakpoint
ALTER TABLE "user_learning_preferences" ADD CONSTRAINT "user_learning_preferences_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;