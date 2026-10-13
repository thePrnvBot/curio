import type { Database } from "@curio/db";
import { course, courseBadge, courseLesson } from "@curio/db/schema/course";
import { asc, desc, eq } from "drizzle-orm";
import { Effect } from "effect";

import type {
  CourseBadgeRecord,
  CourseLessonKind,
  CourseLessonRecord,
  CourseSummary,
} from "../domain/course";
import { CourseOperationFailed } from "../domain/course-operation-failed";
import type { CourseStoreContract } from "../services/course-store";

interface CourseRow {
  readonly completedLessonCount: number;
  readonly createdAt: Date;
  readonly description: string;
  readonly id: string;
  readonly lessonCount: number;
  readonly status: string;
  readonly title: string;
  readonly updatedAt: Date;
}

interface CourseBadgeRow {
  readonly courseId: string | null;
  readonly earnedAt: Date;
  readonly id: string;
  readonly label: string;
}

function rowToCourseSummary(row: CourseRow): CourseSummary {
  return {
    completedLessonCount: row.completedLessonCount,
    createdAt: row.createdAt.toISOString(),
    description: row.description,
    id: row.id,
    lessonCount: row.lessonCount,
    status: row.status,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToBadgeRecord(row: CourseBadgeRow): CourseBadgeRecord {
  return {
    courseId: row.courseId,
    earnedAt: row.earnedAt.toISOString(),
    id: row.id,
    label: row.label,
  };
}

function normalizeLessonKind(kind: string): CourseLessonKind {
  return (["video", "cards", "animation", "recap"] as const).find(
    (candidate) => candidate === kind
  ) ?? "cards";
}

function withCourseError(operation: string) {
  return <Success>(
    effect: Effect.Effect<Success, unknown, never>
  ): Effect.Effect<Success, CourseOperationFailed, never> =>
    Effect.mapError(
      effect,
      (cause: unknown) => new CourseOperationFailed({ cause, operation })
    );
}

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export function createDrizzleCourseStore(
  database: Database
): CourseStoreContract {
  const courseSelection = {
    completedLessonCount: course.completedLessonCount,
    createdAt: course.createdAt,
    description: course.description,
    id: course.id,
    lessonCount: course.lessonCount,
    status: course.status,
    title: course.title,
    updatedAt: course.updatedAt,
  } as const;

  return {
    listCourses: (userId) =>
      withCourseError("listCourses")(
        Effect.tryPromise(() =>
          database
            .select(courseSelection)
            .from(course)
            .where(eq(course.userId, userId))
            .orderBy(desc(course.updatedAt))
        )
      ).pipe(
        Effect.map((rows) => rows.map(rowToCourseSummary))
      ),

    listLessons: (courseId) =>
      withCourseError("listLessons")(
        Effect.tryPromise(() =>
          database
            .select({
              courseId: courseLesson.courseId,
              id: courseLesson.id,
              kind: courseLesson.kind,
              position: courseLesson.position,
              title: courseLesson.title,
            })
            .from(courseLesson)
            .where(eq(courseLesson.courseId, courseId))
            .orderBy(asc(courseLesson.position))
        )
      ).pipe(
        Effect.map(
          (rows): CourseLessonRecord[] =>
            rows.map((row) => ({
              courseId: row.courseId,
              id: row.id,
              kind: normalizeLessonKind(row.kind),
              position: row.position,
              title: row.title,
            }))
        )
      ),

    listBadges: (userId) =>
      withCourseError("listBadges")(
        Effect.tryPromise(() =>
          database
            .select({
              courseId: courseBadge.courseId,
              earnedAt: courseBadge.earnedAt,
              id: courseBadge.id,
              label: courseBadge.label,
            })
            .from(courseBadge)
            .where(eq(courseBadge.userId, userId))
            .orderBy(desc(courseBadge.earnedAt))
        )
      ).pipe(Effect.map((rows) => rows.map(rowToBadgeRecord))),

    createCourse: ({ description, lessons, title, userId }) =>
      withCourseError("createCourse")(
        Effect.tryPromise(async () => {
          const courseId = generateId("course");
          const now = new Date();
          const insertedCourseRows = await database
            .insert(course)
            .values({
              completedLessonCount: 0,
              createdAt: now,
              description,
              id: courseId,
              lessonCount: lessons.length,
              title,
              updatedAt: now,
              userId,
            })
            .returning(courseSelection);

          if (lessons.length > 0) {
            await database.insert(courseLesson).values(
              lessons.map((lesson, lessonIndex) => ({
                courseId,
                // 1-based display position
                id: generateId("lesson"),
                kind: lesson.kind,
                position: lessonIndex + 1,
                title: lesson.title,
              }))
            );
          }

          const insertedCourseRow = insertedCourseRows.at(0);
          if (!insertedCourseRow) {
            throw new Error("Course insert returned no rows");
          }
          return rowToCourseSummary(insertedCourseRow);
        })
      ),

    awardBadge: ({ courseId, label, userId }) =>
      withCourseError("awardBadge")(
        Effect.tryPromise(async () => {
          const insertedBadgeRows = await database
            .insert(courseBadge)
            .values({
              courseId,
              id: generateId("badge"),
              label,
              userId,
            })
            .returning({
              courseId: courseBadge.courseId,
              earnedAt: courseBadge.earnedAt,
              id: courseBadge.id,
              label: courseBadge.label,
            });
          const insertedBadgeRow = insertedBadgeRows.at(0);
          if (!insertedBadgeRow) {
            throw new Error("Badge insert returned no rows");
          }
          return rowToBadgeRecord(insertedBadgeRow);
        })
      ),
  };
}
