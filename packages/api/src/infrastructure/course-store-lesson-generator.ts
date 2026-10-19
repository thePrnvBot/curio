import { Effect } from "effect";

import { CourseNotFound } from "../domain/course";
import { toStoredLessonContent } from "../domain/lesson-content";
import type { LessonContentToolPayload } from "../domain/lesson-content";
import type { LessonGenerationBrief } from "../domain/lesson-generation";
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

export function createCourseStoreLessonGenerator(
  config: CourseStoreLessonGeneratorConfig
): LessonGeneratorContract {
  return {
    generateNextLessonModule: ({ courseId, currentLessonId, userId }) =>
      Effect.gen(function* generateNextLessonModule() {
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
        if (currentIndex === -1 || ordered[currentIndex] === undefined) {
          return { kind: "nothing-ahead" } as const;
        }
        const currentLesson = ordered[currentIndex];

        const currentDetail = yield* config.courseStore
          .getLesson({ courseId, lessonId: currentLesson.id, userId })
          .pipe(Effect.mapError(mapStoreError(currentLesson.title)));

        // The nearest unfilled lesson at or after the reader's position.
        let targetLesson = currentLesson;
        let targetIndex = currentIndex;
        if (currentDetail.content !== null) {
          const nextLesson = ordered[currentIndex + 1];
          if (nextLesson === undefined) {
            return { kind: "nothing-ahead" } as const;
          }
          const nextDetail = yield* config.courseStore
            .getLesson({ courseId, lessonId: nextLesson.id, userId })
            .pipe(Effect.mapError(mapStoreError(nextLesson.title)));
          if (nextDetail.content !== null) {
            return {
              kind: "already-filled",
              lessonId: nextLesson.id,
              title: nextLesson.title,
            } as const;
          }
          targetLesson = nextLesson;
          targetIndex = currentIndex + 1;
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

        const payload = yield* config.generateLessonContent(brief);

        // The Director's own run may have filled this lesson while the model
        // was writing — discard the generated draft rather than overwrite it.
        const latest = yield* config.courseStore
          .getLesson({ courseId, lessonId: targetLesson.id, userId })
          .pipe(Effect.mapError(mapStoreError(targetLesson.title)));
        if (latest.content !== null) {
          return {
            kind: "already-filled",
            lessonId: targetLesson.id,
            title: targetLesson.title,
          } as const;
        }

        const written = yield* config.courseStore
          .writeCourseLessonContent({
            content: toStoredLessonContent(payload),
            courseId,
            lessonId: targetLesson.id,
            userId,
          })
          .pipe(Effect.mapError(mapStoreError(targetLesson.title)));
        return {
          kind: "generated",
          lessonId: written.lessonId,
          title: written.title,
        } as const;
      }),
  };
}
