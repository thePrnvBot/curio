import { TRPCError } from "@trpc/server";
import { Effect } from "effect";
import { z } from "zod";

import { COURSE_LESSON_KINDS } from "../domain/course";
import type { CurioRuntime } from "../composition/runtime";
import {
  BadgeNotFound,
  CourseNotFound,
  LessonNotFound,
} from "../services/course-store";
import { CourseOperationFailed } from "../domain/course-operation-failed";
import { LessonGenerationFailed } from "../domain/lesson-generation-failed";
import { protectedProcedure, router } from "../index";
import { CourseStore } from "../services/course-store";
import { LessonGenerator } from "../services/lesson-generator";

const teachingProseSchema = z
  .string()
  .min(1)
  .max(8000)
  .describe("Teaching prose in markdown");

const videoContentSchema = z.object({
  kind: z.literal("video"),
  body: teachingProseSchema,
  videoUrl: z
    .string()
    .min(1)
    .max(2000)
    .optional()
    .describe("Optional embeddable video URL (YouTube link or direct video)"),
});

const cardsContentSchema = z.object({
  kind: z.literal("cards"),
  body: teachingProseSchema.optional(),
  cards: z
    .array(
      z.object({
        body: z.string().min(1).max(2000),
        title: z.string().min(1).max(200),
      })
    )
    .min(1)
    .max(10),
});

const animationContentSchema = z.object({
  kind: z.literal("animation"),
  body: teachingProseSchema,
  html: z
    .string()
    .min(1)
    .max(60000)
    .describe(
      "Self-contained HTML document (with inline styles and scripts) that plays an interactive teaching animation"
    ),
});

const recapContentSchema = z.object({
  kind: z.literal("recap"),
  questions: z
    .array(
      z.object({
        answerIndex: z.number().int().min(0).max(9),
        explanation: z.string().max(2000).optional(),
        options: z
          .array(z.string().min(1).max(300))
          .min(2)
          .max(6),
        prompt: z.string().min(1).max(500),
      })
    )
    .min(1)
    .max(10),
});

const guidedExplanationSchema = z.object({
  kind: z.literal("guided-explanation"),
  intro: z.string().max(2000).optional(),
  steps: z
    .array(
      z.object({
        narration: z.string().min(1).max(1200),
        visual: z.object({
          kind: z.enum(["code", "markdown"]),
          language: z.string().max(40).optional(),
          source: z.string().min(1).max(8000),
        }),
        durationMs: z.number().int().min(1000).max(600000).optional(),
      })
    )
    .min(2)
    .max(12),
});

const lessonContentSchema = z.discriminatedUnion("kind", [
  videoContentSchema,
  cardsContentSchema,
  animationContentSchema,
  recapContentSchema,
  guidedExplanationSchema,
]);

const lessonInputSchema = z.object({
  content: lessonContentSchema
    .optional()
    .describe("Structured content rendered in the lesson page"),
  kind: z.enum(COURSE_LESSON_KINDS),
  title: z.string().min(1).max(200),
});

const createCourseInputSchema = z.object({
  description: z.string().max(2000).optional(),
  sections: z
    .array(
      z.object({
        lessons: z.array(lessonInputSchema).min(1).max(20),
        title: z.string().min(1).max(200),
      })
    )
    .min(1)
    .max(12),
  title: z.string().min(1).max(200).optional(),
});

const badgeAwardInputSchema = z.object({
  courseId: z.string().min(1).max(64).nullable(),
  label: z.string().min(1).max(120),
});

const courseLessonLookupSchema = z.object({
  courseId: z.string().min(1).max(64),
  lessonId: z.string().min(1).max(64),
});

async function unwrap<T>(value: Promise<T>): Promise<T> {
  try {
    return await value;
  } catch (error) {
    if (error instanceof CourseNotFound) {
      throw new TRPCError({
        cause: error,
        code: "NOT_FOUND",
        message: error.message,
      });
    }
    if (error instanceof LessonNotFound) {
      throw new TRPCError({
        cause: error,
        code: "NOT_FOUND",
        message: error.message,
      });
    }
    if (error instanceof BadgeNotFound) {
      throw new TRPCError({
        cause: error,
        code: "NOT_FOUND",
        message: error.message,
      });
    }
    if (error instanceof CourseOperationFailed) {
      throw new TRPCError({
        cause: error,
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }
    if (error instanceof LessonGenerationFailed) {
      throw new TRPCError({
        cause: error,
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }
    throw error;
  }
}

export function createCoursesRouter(runtime: CurioRuntime) {
  return router({
    list: protectedProcedure.query(({ ctx }) =>
      unwrap(
        runtime.runPromise(
          Effect.gen(function* listCourses() {
            const courseStore = yield* CourseStore;
            return [...(yield* courseStore.listCourses(ctx.session.user.id))];
          })
        )
      )
    ),

    listBadges: protectedProcedure.query(({ ctx }) =>
      unwrap(
        runtime.runPromise(
          Effect.gen(function* listBadges() {
            const courseStore = yield* CourseStore;
            return [...(yield* courseStore.listBadges(ctx.session.user.id))];
          })
        )
      )
    ),

    delete: protectedProcedure
      .input(
        z.object({
          courseId: z.string().min(1).max(64),
        })
      )
      .mutation(({ ctx, input }) =>
        unwrap(
          runtime.runPromise(
            Effect.gen(function* deleteCourse() {
              const courseStore = yield* CourseStore;
              yield* courseStore.deleteCourse(
                input.courseId,
                ctx.session.user.id
              );
              return { deleted: true };
            })
          )
        )
      ),

    get: protectedProcedure
      .input(
        z.object({
          courseId: z.string().min(1).max(64),
        })
      )
      .query(({ ctx, input }) =>
        unwrap(
          runtime.runPromise(
            Effect.gen(function* getCourse() {
              const courseStore = yield* CourseStore;
              return yield* courseStore.getCourseStructure(
                input.courseId,
                ctx.session.user.id
              );
            })
          )
        )
      ),

    getLesson: protectedProcedure
      .input(courseLessonLookupSchema)
      .query(({ ctx, input }) =>
        unwrap(
          runtime.runPromise(
            Effect.gen(function* getLesson() {
              const courseStore = yield* CourseStore;
              return yield* courseStore.getLesson(
                input.courseId,
                input.lessonId,
                ctx.session.user.id
              );
            })
          )
        )
      ),

    /** Progressive course filling: generates the nearest unfilled lesson at
     * or after the one the reader has open — one lesson per call. */
    generateNextLessonModule: protectedProcedure
      .input(courseLessonLookupSchema)
      .mutation(({ ctx, input }) =>
        unwrap(
          runtime.runPromise(
            Effect.gen(function* generateNextLessonModule() {
              const lessonGenerator = yield* LessonGenerator;
              return yield* lessonGenerator.generateNextLessonModule({
                courseId: input.courseId,
                currentLessonId: input.lessonId,
                userId: ctx.session.user.id,
              });
            })
          )
        )
      ),

    completeLesson: protectedProcedure
      .input(courseLessonLookupSchema)
      .mutation(({ ctx, input }) =>
        unwrap(
          runtime.runPromise(
            Effect.gen(function* completeLesson() {
              const courseStore = yield* CourseStore;
              const completion = yield* courseStore.completeLesson(
                input.courseId,
                input.lessonId,
                ctx.session.user.id
              );
              // The course badge is granted exactly when the last lesson lands.
              let awardedBadge = null;
              if (completion.courseCompleted) {
                awardedBadge = yield* courseStore.awardBadge({
                  courseId: completion.course.id,
                  label: completion.course.title,
                  userId: ctx.session.user.id,
                });
              }
              return { ...completion, badge: awardedBadge };
            })
          )
        )
      ),

    create: protectedProcedure
      .input(createCourseInputSchema)
      .mutation(({ ctx, input }) =>
        unwrap(
          runtime.runPromise(
            Effect.gen(function* createCourse() {
              const courseStore = yield* CourseStore;
              return yield* courseStore.createCourse({
                description: input.description ?? "",
                sections: input.sections.map((section) => ({
                  lessons: section.lessons.map((lesson) => ({
                    content: lesson.content ?? undefined,
                    kind: lesson.kind,
                    title: lesson.title,
                  })),
                  title: section.title,
                })),
                title: input.title ?? "Untitled course",
                userId: ctx.session.user.id,
              });
            })
          )
        )
      ),

    awardBadge: protectedProcedure
      .input(badgeAwardInputSchema)
      .mutation(({ ctx, input }) =>
        unwrap(
          runtime.runPromise(
            Effect.gen(function* awardBadge() {
              const courseStore = yield* CourseStore;
              return yield* courseStore.awardBadge({
                courseId: input.courseId,
                label: input.label,
                userId: ctx.session.user.id,
              });
            })
          )
        )
      ),

    deleteBadge: protectedProcedure
      .input(
        z.object({
          badgeId: z.string().min(1).max(64),
        })
      )
      .mutation(({ ctx, input }) =>
        unwrap(
          runtime.runPromise(
            Effect.gen(function* deleteBadge() {
              const courseStore = yield* CourseStore;
              yield* courseStore.deleteBadge(
                input.badgeId,
                ctx.session.user.id
              );
              return { deleted: true };
            })
          )
        )
      ),
  });
}
