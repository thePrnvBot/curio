import { Effect } from "effect";

import { CourseNotFound } from "../domain/course";
import { toStoredLessonContent } from "../domain/lesson-content";
import type { LessonContentToolPayload } from "../domain/lesson-content";
import type {
  LessonGenerationBrief,
  LessonGenerationOutcome,
  LessonGenerationSchedule,
  LessonGenerationTarget,
} from "../domain/lesson-generation";
import { LessonGenerationFailed } from "../domain/lesson-generation";
import type { CourseStoreContract } from "../services/course-store";
import type { LessonGeneratorContract } from "../services/lesson-generator";

export interface CourseStoreLessonGeneratorConfig {
  readonly courseStore: CourseStoreContract;
  readonly generateLessonContent: (
    brief: LessonGenerationBrief
  ) => Effect.Effect<LessonContentToolPayload, LessonGenerationFailed>;
}

/** Store failures become generation failures; CourseNotFound keeps its own
 * channel so the router can answer 404. */
function mapStoreError(
  lessonTitle: string
): (cause: unknown) => LessonGenerationFailed | CourseNotFound {
  return (cause) =>
    cause instanceof CourseNotFound
      ? cause
      : new LessonGenerationFailed({ cause, lessonTitle });
}

type TargetResolution =
  | { readonly kind: "target"; readonly target: LessonGenerationTarget }
  | {
      readonly kind: "already-filled";
      readonly lessonId: string;
      readonly title: string;
    }
  | { readonly kind: "nothing-ahead" };

export function createCourseStoreLessonGenerator(
  config: CourseStoreLessonGeneratorConfig
): LessonGeneratorContract {
  // Per-user-course generation is single-flight: a reader opening several
  // lessons, or two tabs, must not fan out duplicate model work. The
  // check-and-add is synchronous, so it is atomic on the JS event loop.
  const inFlight = new Set<string>();

  const resolveTarget = Effect.fnUntraced(function* resolveLessonTarget({
    courseId,
    currentLessonId,
    userId,
  }: {
    courseId: string;
    currentLessonId: string;
    userId: string;
  }): Effect.fn.Return<
    TargetResolution,
    LessonGenerationFailed | CourseNotFound
  > {
    const detail = yield* config.courseStore
      .getCourseStructure({ courseId, userId })
      .pipe(Effect.mapError(mapStoreError("the course outline")));
    const ordered = detail.sections.flatMap((section) =>
      section.lessons.map((lesson) => ({
        ...lesson,
        sectionTitle: section.title,
      }))
    );
    const currentIndex = ordered.findIndex(
      (lesson) => lesson.id === currentLessonId
    );
    if (currentIndex === -1) {
      return { kind: "nothing-ahead" } as const;
    }

    // "Nearest unfilled at or after the reader" means scanning forward, not
    // just probing the immediate next lesson: two filled lessons in a row
    // must not stall a course that still has empty modules later.
    const targetIndex = ordered.findIndex(
      (lesson, index) => index >= currentIndex && !lesson.hasContent
    );
    if (targetIndex === -1) {
      return { kind: "nothing-ahead" } as const;
    }
    const targetLesson = ordered[targetIndex];
    if (targetLesson === undefined) {
      return { kind: "nothing-ahead" } as const;
    }

    const previousLesson = ordered[targetIndex - 1] ?? null;
    const brief: LessonGenerationBrief = {
      courseDescription: detail.course.description,
      courseTitle: detail.course.title,
      outlineLines: ordered.map(
        (lesson, index) =>
          `${index + 1}. [${lesson.sectionTitle}] ${lesson.kind}: "${lesson.title}"`
      ),
      previousLessonTitle: previousLesson?.title ?? null,
      targetKind: targetLesson.kind,
      targetTitle: targetLesson.title,
    };

    return {
      kind: "target",
      target: {
        brief,
        lessonId: targetLesson.id,
        title: targetLesson.title,
      },
    } as const;
  });

  const generateTarget = Effect.fnUntraced(function* generateLesson(
    target: LessonGenerationTarget,
    scope: { readonly courseId: string; readonly userId: string }
  ): Effect.fn.Return<
    LessonGenerationOutcome,
    LessonGenerationFailed | CourseNotFound
  > {
    // The write is conditional: if the Director filled the lesson while the
    // model was writing, that newer content wins.
    return yield* Effect.gen(function* generateAndWrite() {
      const payload = yield* config.generateLessonContent(target.brief);
      const written = yield* config.courseStore
        .writeCourseLessonContent({
          content: toStoredLessonContent(payload),
          courseId: scope.courseId,
          lessonId: target.lessonId,
          onlyIfEmpty: true,
          userId: scope.userId,
        })
        .pipe(Effect.mapError(mapStoreError(target.title)));
      if (!written.written) {
        return {
          kind: "already-filled",
          lessonId: written.lessonId,
          title: written.title,
        } as const;
      }
      return {
        kind: "generated",
        lessonId: written.lessonId,
        title: written.title,
      } as const;
    });
  });

  return {
    generateNextLessonModule: ({ courseId, currentLessonId, userId }) =>
      Effect.gen(function* generateNextLessonModule() {
        const resolution = yield* resolveTarget({
          courseId,
          currentLessonId,
          userId,
        });
        if (resolution.kind !== "target") {
          return resolution;
        }
        return yield* generateTarget(resolution.target, {
          courseId,
          userId,
        });
      }),

    scheduleNextLessonModule: ({ courseId, currentLessonId, userId }) =>
      Effect.gen(function* scheduleNextLessonModule() {
        const resolution = yield* resolveTarget({
          courseId,
          currentLessonId,
          userId,
        });
        if (resolution.kind !== "target") {
          return resolution;
        }

        const generationKey = `${userId}:${courseId}`;
        if (inFlight.has(generationKey)) {
          return { kind: "already-generating" } as const;
        }
        inFlight.add(generationKey);

        yield* Effect.forkDetach(
          generateTarget(resolution.target, { courseId, userId }).pipe(
            Effect.tapError((generationError) =>
              Effect.logError(
                "Background lesson generation failed",
                resolution.target.lessonId,
                generationError
              )
            ),
            Effect.ignore,
            Effect.ensuring(
              Effect.sync(() => {
                inFlight.delete(generationKey);
              })
            )
          )
        );
        return {
          kind: "scheduled",
          lessonId: resolution.target.lessonId,
          title: resolution.target.title,
        } as const satisfies LessonGenerationSchedule;
      }),
  };
}
