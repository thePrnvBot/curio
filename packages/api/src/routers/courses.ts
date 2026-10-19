import { Effect, Option } from "effect";
import { z } from "zod";

import type { CurioRuntime } from "../composition/runtime";
import {
  lessonContentSchema,
  lessonKindSchema,
} from "../domain/lesson-content";
import { CourseStore } from "../services/course-store";
import { LessonCompletion } from "../services/lesson-completion";
import { LessonGenerator } from "../services/lesson-generator";
import {
  protectedProcedure,
  respondInternalError,
  respondNotFound,
  router,
} from "./trpc";

const lessonContentInputSchema = z.object({
  content: lessonContentSchema
    .optional()
    .describe("Structured content rendered in the lesson page"),
  kind: lessonKindSchema,
  title: z.string().min(1).max(200),
});

const createCourseInputSchema = z.object({
  description: z.string().max(2000).optional(),
  sections: z
    .array(
      z.object({
        lessons: z.array(lessonContentInputSchema).min(1).max(20),
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

const courseIdInputSchema = z.object({
  courseId: z.string().min(1).max(64),
});

const badgeIdInputSchema = z.object({
  badgeId: z.string().min(1).max(64),
});

/** Lookup failures answer 404; storage and generation failures answer 500. */
const coursesErrorMapping = Effect.catchTags({
  BadgeNotFound: respondNotFound,
  CourseNotFound: respondNotFound,
  CourseOperationFailed: respondInternalError,
  LessonGenerationFailed: respondInternalError,
  LessonNotFound: respondNotFound,
});

export function createCoursesRouter(runtime: CurioRuntime) {
  return router({
    list: protectedProcedure.query(({ ctx }) =>
      runtime.runPromise(
        Effect.gen(function* listCourses() {
          const courseStore = yield* CourseStore;
          return [...(yield* courseStore.listCourses(ctx.session.user.id))];
        }).pipe(coursesErrorMapping)
      )
    ),

    listBadges: protectedProcedure.query(({ ctx }) =>
      runtime.runPromise(
        Effect.gen(function* listBadges() {
          const courseStore = yield* CourseStore;
          return [...(yield* courseStore.listBadges(ctx.session.user.id))];
        }).pipe(coursesErrorMapping)
      )
    ),

    delete: protectedProcedure
      .input(courseIdInputSchema)
      .mutation(({ ctx, input }) =>
        runtime.runPromise(
          Effect.gen(function* deleteCourse() {
            const courseStore = yield* CourseStore;
            yield* courseStore.deleteCourse({
              courseId: input.courseId,
              userId: ctx.session.user.id,
            });
            return { deleted: true };
          }).pipe(coursesErrorMapping)
        )
      ),

    get: protectedProcedure.input(courseIdInputSchema).query(({ ctx, input }) =>
      runtime.runPromise(
        Effect.gen(function* getCourse() {
          const courseStore = yield* CourseStore;
          return yield* courseStore.getCourseStructure({
            courseId: input.courseId,
            userId: ctx.session.user.id,
          });
        }).pipe(coursesErrorMapping)
      )
    ),

    getLesson: protectedProcedure
      .input(courseLessonLookupSchema)
      .query(({ ctx, input }) =>
        runtime.runPromise(
          Effect.gen(function* getLesson() {
            const courseStore = yield* CourseStore;
            return yield* courseStore.getLesson({
              courseId: input.courseId,
              lessonId: input.lessonId,
              userId: ctx.session.user.id,
            });
          }).pipe(coursesErrorMapping)
        )
      ),

    /** Progressive course filling: generates the nearest unfilled lesson at
     * or after the one the reader has open — one lesson per call. */
    generateNextLessonModule: protectedProcedure
      .input(courseLessonLookupSchema)
      .mutation(({ ctx, input }) =>
        runtime.runPromise(
          Effect.gen(function* generateNextLessonModule() {
            const lessonGenerator = yield* LessonGenerator;
            return yield* lessonGenerator.generateNextLessonModule({
              courseId: input.courseId,
              currentLessonId: input.lessonId,
              userId: ctx.session.user.id,
            });
          }).pipe(coursesErrorMapping)
        )
      ),

    completeLesson: protectedProcedure
      .input(courseLessonLookupSchema)
      .mutation(({ ctx, input }) =>
        runtime.runPromise(
          Effect.gen(function* completeLesson() {
            const lessonCompletion = yield* LessonCompletion;
            const { awardedBadge, completion } =
              yield* lessonCompletion.completeLesson({
                courseId: input.courseId,
                lessonId: input.lessonId,
                userId: ctx.session.user.id,
              });
            return {
              ...completion,
              // The wire carries null, not Option — fold at the boundary.
              badge: Option.getOrNull(awardedBadge),
            };
          }).pipe(coursesErrorMapping)
        )
      ),

    create: protectedProcedure
      .input(createCourseInputSchema)
      .mutation(({ ctx, input }) =>
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
          }).pipe(coursesErrorMapping)
        )
      ),

    awardBadge: protectedProcedure
      .input(badgeAwardInputSchema)
      .mutation(({ ctx, input }) =>
        runtime.runPromise(
          Effect.gen(function* awardBadge() {
            const courseStore = yield* CourseStore;
            return yield* courseStore.awardBadge({
              courseId: input.courseId,
              label: input.label,
              userId: ctx.session.user.id,
            });
          }).pipe(coursesErrorMapping)
        )
      ),

    deleteBadge: protectedProcedure
      .input(badgeIdInputSchema)
      .mutation(({ ctx, input }) =>
        runtime.runPromise(
          Effect.gen(function* deleteBadge() {
            const courseStore = yield* CourseStore;
            yield* courseStore.deleteBadge({
              badgeId: input.badgeId,
              userId: ctx.session.user.id,
            });
            return { deleted: true };
          }).pipe(coursesErrorMapping)
        )
      ),
  });
}
