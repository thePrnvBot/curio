import { TRPCError } from "@trpc/server";
import { Effect } from "effect";
import { z } from "zod";

import { COURSE_LESSON_KINDS } from "../domain/course";
import type { CurioRuntime } from "../composition/runtime";
import { CourseOperationFailed } from "../domain/course-operation-failed";
import { protectedProcedure, router } from "../index";
import { CourseStore } from "../services/course-store";

const courseLessonInputSchema = z.object({
  kind: z.enum(COURSE_LESSON_KINDS),
  title: z.string().min(1).max(200),
});

const createCourseInputSchema = z.object({
  description: z.string().max(2000).optional(),
  lessons: z.array(courseLessonInputSchema).max(50).default([]),
  title: z.string().min(1).max(200).optional(),
});

const badgeAwardInputSchema = z.object({
  courseId: z.string().min(1).max(64).nullable(),
  label: z.string().min(1).max(120),
});

async function unwrap<T>(value: Promise<T>): Promise<T> {
  try {
    return await value;
  } catch (error) {
    if (error instanceof CourseOperationFailed) {
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
            return [
              ...(yield* courseStore.listBadges(ctx.session.user.id)),
            ];
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
                lessons: input.lessons,
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
  });
}
