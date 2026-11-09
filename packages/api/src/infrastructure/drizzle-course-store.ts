import type { Database } from "@curio/db";
import {
  course,
  courseBadge,
  courseLesson,
  courseSection,
} from "@curio/db/schema/course";
import type { LessonContent } from "@curio/db/schema/course";
import { asc, desc, eq, and, isNull, sql } from "drizzle-orm";
import { Effect } from "effect";

import {
  BadgeNotFound,
  CourseNotFound,
  CourseOperationFailed,
  isCourseLookupFailure,
  normalizeCourseStatus,
  normalizeLessonKind,
  LessonNotFound,
} from "../domain/course";
import type {
  CourseBadgeRecord,
  CourseLessonSummary,
  CourseLessonWrittenResult,
  CourseDetail,
  CourseLessonDetail,
  CourseSectionInput,
  CourseStoreFailure,
  CourseScaffoldResult,
  CourseSummary,
  LessonCompletionResult,
} from "../domain/course";
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

interface CourseSectionRow {
  readonly id: string;
  readonly position: number;
  readonly title: string;
}

interface CourseLessonSummaryRow {
  readonly completedAt: Date | null;
  readonly hasContent: boolean;
  readonly id: string;
  readonly kind: string;
  readonly position: number;
  readonly title: string;
}

interface CourseLessonRow extends CourseLessonSummaryRow {
  readonly courseId: string;
  readonly sectionId: string | null;
}

interface CourseLessonContentRow extends CourseLessonRow {
  readonly content: LessonContent | null;
}

function toCourseSummary(row: CourseRow): CourseSummary {
  return {
    completedLessonCount: row.completedLessonCount,
    createdAt: row.createdAt.toISOString(),
    description: row.description,
    id: row.id,
    lessonCount: row.lessonCount,
    status: normalizeCourseStatus(row.status),
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toBadgeRecord(row: CourseBadgeRow): CourseBadgeRecord {
  return {
    courseId: row.courseId,
    earnedAt: row.earnedAt.toISOString(),
    id: row.id,
    label: row.label,
  };
}

/**
 * Normalizes storage failures to `CourseOperationFailed` while *preserving*
 * the domain lookup failures (`CourseNotFound`, `LessonNotFound`,
 * `BadgeNotFound`) — the wrapper used to flatten every failure, which left
 * the NotFound guards in the courses router dead and made a missing course
 * answer 500 instead of 404.
 */
function withCourseError(operation: string) {
  return <Success>(
    effect: Effect.Effect<Success, unknown, never>
  ): Effect.Effect<Success, CourseStoreFailure, never> =>
    effect.pipe(
      Effect.catchIf(
        isCourseLookupFailure,
        (lookupFailure) => Effect.fail(lookupFailure),
        (otherCause) =>
          Effect.fail(
            new CourseOperationFailed({ cause: otherCause, operation })
          )
      )
    );
}

function normalizeLessonPosition(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function toLessonSummary(
  row: CourseLessonSummaryRow
): CourseLessonSummary {
  return {
    completed: row.completedAt !== null,
    hasContent: row.hasContent,
    id: row.id,
    kind: normalizeLessonKind(row.kind),
    position: normalizeLessonPosition(row.position),
    title: row.title,
  };
}

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

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

const lessonSelection = {
  completedAt: courseLesson.completedAt,
  courseId: courseLesson.courseId,
  hasContent: sql<boolean>`(${courseLesson.content} is not null)`,
  id: courseLesson.id,
  kind: courseLesson.kind,
  position: courseLesson.position,
  sectionId: courseLesson.sectionId,
  title: courseLesson.title,
} as const;

/** Detail reads keep the JSONB body; structure lists project only
 * `hasContent`. */
const lessonContentSelection = {
  ...lessonSelection,
  content: courseLesson.content,
} as const;

export function createDrizzleCourseStore(
  database: Database
): CourseStoreContract {
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
      ).pipe(Effect.map((rows) => rows.map(toCourseSummary))),

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
      ).pipe(Effect.map((rows) => rows.map(toBadgeRecord))),

    deleteCourse: ({ courseId, userId }) =>
      withCourseError("deleteCourse")(
        Effect.gen(function* removeCourse() {
          const deletedRows = yield* Effect.tryPromise(() =>
            database
              .delete(course)
              .where(and(eq(course.id, courseId), eq(course.userId, userId)))
              .returning({ id: course.id })
          );
          if (deletedRows.length === 0) {
            return yield* Effect.fail(new CourseNotFound({ courseId }));
          }
          yield* Effect.void;
        })
      ),

    createCourse: ({ description, sections, title, userId }) =>
      withCourseError("createCourse")(
        Effect.tryPromise(async () => {
          const courseId = generateId("course");
          const lessonInputs = sections.flatMap((section) => section.lessons);
          const now = new Date();

          const insertedCourseRows = await database.transaction(
            async (transactionDatabase) => {
              const createdCourseRows = await transactionDatabase
                .insert(course)
                .values({
                  completedLessonCount: 0,
                  createdAt: now,
                  description,
                  id: courseId,
                  lessonCount: lessonInputs.length,
                  title,
                  updatedAt: now,
                  userId,
                })
                .returning(courseSelection);

              const writeSection = async (
                sectionInput: CourseSectionInput,
                sectionIndex: number
              ): Promise<void> => {
                if (sectionInput.lessons.length === 0) {
                  return;
                }
                const sectionId = generateId("section");
                await transactionDatabase.insert(courseSection).values({
                  courseId,
                  id: sectionId,
                  position: sectionIndex + 1,
                  title: sectionInput.title,
                });
                await transactionDatabase.insert(courseLesson).values(
                  sectionInput.lessons.map((lesson, lessonIndex) => ({
                    content: lesson.content ?? null,
                    courseId,
                    id: generateId("lesson"),
                    kind: lesson.kind,
                    position: lessonIndex + 1,
                    sectionId,
                    title: lesson.title,
                  }))
                );
              };

              // Sequential on purpose: Drizzle transactions run on one
              // connection, so parallel statements would interleave there
              // anyway while making ordering non-deterministic.
              for (const [sectionIndex, sectionInput] of sections.entries()) {
                // oxlint-disable-next-line eslint/no-await-in-loop -- transaction order matters
                await writeSection(sectionInput, sectionIndex);
              }

              return createdCourseRows;
            }
          );

          const createdCourseRow = insertedCourseRows.at(0);
          if (createdCourseRow === undefined) {
            throw new Error("Course insert returned no rows");
          }
          return toCourseSummary(createdCourseRow);
        })
      ),

    createCourseScaffold: ({ description, sections, title, userId }) =>
      withCourseError("createCourseScaffold")(
        Effect.tryPromise(async () => {
          const courseId = generateId("course");
          const lessonInputs = sections.flatMap((section) => section.lessons);
          const now = new Date();
          const scaffoldLessons: {
            id: string;
            kind: string;
            position: number;
            sectionTitle: string;
            title: string;
          }[] = [];

          await database.transaction(async (transactionDatabase) => {
            const createdCourseRows = await transactionDatabase
              .insert(course)
              .values({
                completedLessonCount: 0,
                createdAt: now,
                description,
                id: courseId,
                lessonCount: lessonInputs.length,
                title,
                updatedAt: now,
                userId,
              })
              .returning(courseSelection);
            const courseRow = createdCourseRows.at(0);
            if (courseRow === undefined) {
              throw new Error("Course scaffold insert returned no rows");
            }

            const writeSection = async (
              sectionInput: CourseSectionInput,
              sectionIndex: number
            ): Promise<{
              insertedLessonRows: {
                id: string;
                kind: string;
                position: number;
                title: string;
              }[];
              sectionTitle: string;
            }> => {
              if (sectionInput.lessons.length === 0) {
                return {
                  insertedLessonRows: [],
                  sectionTitle: sectionInput.title,
                };
              }
              const sectionId = generateId("section");
              await transactionDatabase.insert(courseSection).values({
                courseId,
                id: sectionId,
                position: sectionIndex + 1,
                title: sectionInput.title,
              });
              const insertedLessonRows = await transactionDatabase
                .insert(courseLesson)
                .values(
                  sectionInput.lessons.map((lesson, lessonIndex) => ({
                    content: null,
                    courseId,
                    id: generateId("lesson"),
                    kind: lesson.kind,
                    position: lessonIndex + 1,
                    sectionId,
                    title: lesson.title,
                  }))
                )
                .returning({
                  id: courseLesson.id,
                  kind: courseLesson.kind,
                  position: courseLesson.position,
                  title: courseLesson.title,
                });
              return { insertedLessonRows, sectionTitle: sectionInput.title };
            };

            for (const [sectionIndex, sectionInput] of sections.entries()) {
              // oxlint-disable-next-line eslint/no-await-in-loop -- transaction order matters
              const sectionResult = await writeSection(
                sectionInput,
                sectionIndex
              );
              for (const insertedLesson of sectionResult.insertedLessonRows) {
                scaffoldLessons.push({
                  id: insertedLesson.id,
                  kind: insertedLesson.kind,
                  position: insertedLesson.position,
                  sectionTitle: sectionResult.sectionTitle,
                  title: insertedLesson.title,
                });
              }
            }
          });

          return {
            course: {
              id: courseId,
              lessonCount: scaffoldLessons.length,
              title,
            },
            lessons: scaffoldLessons.map((scaffoldLesson) => ({
              courseId,
              id: scaffoldLesson.id,
              kind: normalizeLessonKind(scaffoldLesson.kind),
              position: scaffoldLesson.position,
              sectionTitle: scaffoldLesson.sectionTitle,
              title: scaffoldLesson.title,
            })),
          } satisfies CourseScaffoldResult;
        })
      ),

    writeCourseLessonContent: ({
      content,
      courseId,
      lessonId,
      onlyIfEmpty = false,
      userId,
    }) =>
      withCourseError("writeCourseLessonContent")(
        Effect.gen(function* writeLessonContent() {
          const courseRows = yield* Effect.tryPromise(() =>
            database
              .select({ id: course.id })
              .from(course)
              .where(and(eq(course.id, courseId), eq(course.userId, userId)))
              .limit(1)
          );
          if (courseRows.at(0) === undefined) {
            return yield* Effect.fail(new CourseNotFound({ courseId }));
          }

          const lessonRows = yield* Effect.tryPromise(() =>
            database
              .select(lessonSelection)
              .from(courseLesson)
              .where(
                and(
                  eq(courseLesson.id, lessonId),
                  eq(courseLesson.courseId, courseId)
                )
              )
              .limit(1)
          );
          const lessonRow = lessonRows.at(0);
          if (lessonRow === undefined) {
            return yield* Effect.fail(
              new LessonNotFound({ courseId, lessonId })
            );
          }

          const now = new Date();
          const wroteContent = yield* Effect.tryPromise(async () => {
            const updatedRows = await database.transaction(
              async (transactionDatabase) => {
                const rows = await transactionDatabase
                  .update(courseLesson)
                  .set({ content })
                  .where(
                    onlyIfEmpty
                      ? and(
                          eq(courseLesson.id, lessonId),
                          isNull(courseLesson.content)
                        )
                      : eq(courseLesson.id, lessonId)
                  )
                  .returning({ id: courseLesson.id });
                if (rows.at(0) === undefined) {
                  return false;
                }
                await transactionDatabase
                  .update(course)
                  .set({ updatedAt: now })
                  .where(eq(course.id, courseId));
                return true;
              }
            );
            return updatedRows;
          });

          return {
            lessonId: lessonRow.id,
            position: normalizeLessonPosition(lessonRow.position),
            title: lessonRow.title,
            written: wroteContent,
          } satisfies CourseLessonWrittenResult;
        })
      ),

    getCourseStructure: ({ courseId, userId }) =>
      withCourseError("getCourseStructure")(
        Effect.gen(function* readStructure() {
          const courseRows = yield* Effect.tryPromise(() =>
            database
              .select(courseSelection)
              .from(course)
              .where(and(eq(course.id, courseId), eq(course.userId, userId)))
              .limit(1)
          );
          const courseRow = courseRows.at(0);
          if (courseRow === undefined) {
            return yield* Effect.fail(new CourseNotFound({ courseId }));
          }

          const sectionRows: CourseSectionRow[] = yield* Effect.tryPromise(() =>
            database
              .select({
                id: courseSection.id,
                position: courseSection.position,
                title: courseSection.title,
              })
              .from(courseSection)
              .where(eq(courseSection.courseId, courseId))
              .orderBy(asc(courseSection.position))
          );

          const lessonRows: CourseLessonRow[] = yield* Effect.tryPromise(() =>
            database
              .select(lessonSelection)
              .from(courseLesson)
              .where(eq(courseLesson.courseId, courseId))
              .orderBy(asc(courseLesson.position))
          );

          const unclaimed = new Set(lessonRows.map((row) => row.id));

          // Mutable while grouping; the readonly CourseSectionDetail shape is
          // satisfied structurally on return.
          const sections: {
            id: string | null;
            lessons: CourseLessonSummary[];
            title: string;
          }[] = sectionRows.map((sectionRow) => {
            const members = lessonRows
              .filter((row) => row.sectionId === sectionRow.id)
              .map(toLessonSummary);
            for (const memberRow of members) {
              unclaimed.delete(memberRow.id);
            }
            return {
              id: sectionRow.id,
              lessons: members,
              title: sectionRow.title,
            };
          });

          // Lessons that predate the sections table (sectionId = null) fold
          // into the first section when one exists.
          const unsectioned = lessonRows.filter(
            (row) => row.sectionId === null && unclaimed.has(row.id)
          );
          if (unsectioned.length > 0) {
            const firstSection = sections.at(0);
            if (firstSection === undefined) {
              sections.push({
                id: null,
                lessons: unsectioned.map(toLessonSummary),
                title: courseRow.title,
              });
            } else {
              firstSection.lessons.push(...unsectioned.map(toLessonSummary));
            }
          }

          return {
            course: toCourseSummary(courseRow),
            sections,
          } satisfies CourseDetail;
        })
      ),

    getLesson: ({ courseId, lessonId, userId }) =>
      withCourseError("getLesson")(
        Effect.gen(function* readLesson() {
          const courseRows = yield* Effect.tryPromise(() =>
            database
              .select({ id: course.id })
              .from(course)
              .where(and(eq(course.id, courseId), eq(course.userId, userId)))
              .limit(1)
          );
          if (courseRows.at(0) === undefined) {
            return yield* Effect.fail(new CourseNotFound({ courseId }));
          }

          const lessonRows: CourseLessonContentRow[] = yield* Effect.tryPromise(
            () =>
              database
                .select(lessonContentSelection)
                .from(courseLesson)
                .where(
                  and(
                    eq(courseLesson.id, lessonId),
                    eq(courseLesson.courseId, courseId)
                  )
                )
                .limit(1)
          );
          const lessonRow = lessonRows.at(0);
          if (lessonRow === undefined) {
            return yield* Effect.fail(
              new LessonNotFound({ courseId, lessonId })
            );
          }

          return {
            completed: lessonRow.completedAt !== null,
            content: lessonRow.content,
            courseId: lessonRow.courseId,
            id: lessonRow.id,
            kind: normalizeLessonKind(lessonRow.kind),
            position: normalizeLessonPosition(lessonRow.position),
            title: lessonRow.title,
          } satisfies CourseLessonDetail;
        })
      ),

    completeLesson: ({ courseId, lessonId, userId }) =>
      withCourseError("completeLesson")(
        Effect.gen(function* markLessonComplete() {
          const courseRows = yield* Effect.tryPromise(() =>
            database
              .select(courseSelection)
              .from(course)
              .where(and(eq(course.id, courseId), eq(course.userId, userId)))
              .limit(1)
          );
          const courseRow = courseRows.at(0);
          if (courseRow === undefined) {
            return yield* Effect.fail(new CourseNotFound({ courseId }));
          }

          const lessonRows = yield* Effect.tryPromise(() =>
            database
              .select(lessonSelection)
              .from(courseLesson)
              .where(
                and(
                  eq(courseLesson.id, lessonId),
                  eq(courseLesson.courseId, courseId)
                )
              )
              .limit(1)
          );
          const lessonRow = lessonRows.at(0);
          if (lessonRow === undefined) {
            return yield* Effect.fail(
              new LessonNotFound({ courseId, lessonId })
            );
          }

          if (lessonRow.completedAt !== null) {
            // Already completed: report state without inflating the counter.
            return {
              course: toCourseSummary(courseRow),
              courseCompleted:
                courseRow.completedLessonCount >= courseRow.lessonCount &&
                courseRow.lessonCount > 0,
              newlyCompleted: false,
            } satisfies LessonCompletionResult;
          }

          const completion = yield* Effect.tryPromise(() =>
            database.transaction(async (transactionDatabase) => {
              const now = new Date();
              // The conditional update is the idempotency gate: concurrent
              // completions race here and only the winner increments.
              const newlyCompletedRows = await transactionDatabase
                .update(courseLesson)
                .set({ completedAt: now })
                .where(
                  and(
                    eq(courseLesson.id, lessonId),
                    eq(courseLesson.courseId, courseId),
                    isNull(courseLesson.completedAt)
                  )
                )
                .returning({ id: courseLesson.id });
              if (newlyCompletedRows.at(0) === undefined) {
                const currentRows = await transactionDatabase
                  .select(courseSelection)
                  .from(course)
                  .where(
                    and(eq(course.id, courseId), eq(course.userId, userId))
                  )
                  .limit(1);
                const currentRow = currentRows.at(0);
                if (currentRow === undefined) {
                  throw new CourseNotFound({ courseId });
                }
                return { courseRow: currentRow, newlyCompleted: false };
              }

              const updatedRows = await transactionDatabase
                .update(course)
                .set({
                  completedLessonCount: sql`least(${course.completedLessonCount} + 1, ${course.lessonCount})`,
                  status: sql`case when ${course.completedLessonCount} + 1 >= ${course.lessonCount} and ${course.lessonCount} > 0 then 'completed' else 'active' end`,
                })
                .where(and(eq(course.id, courseId), eq(course.userId, userId)))
                .returning(courseSelection);
              const updatedRow = updatedRows.at(0);
              if (updatedRow === undefined) {
                throw new CourseNotFound({ courseId });
              }
              return { courseRow: updatedRow, newlyCompleted: true };
            })
          );

          return {
            course: toCourseSummary(completion.courseRow),
            courseCompleted:
              completion.courseRow.completedLessonCount >=
                completion.courseRow.lessonCount &&
              completion.courseRow.lessonCount > 0,
            newlyCompleted: completion.newlyCompleted,
          } satisfies LessonCompletionResult;
        })
      ),

    awardBadge: ({ courseId, label, userId }) =>
      withCourseError("awardBadge")(
        Effect.gen(function* awardCourseBadge() {
          if (courseId !== null) {
            const ownedCourseRows = yield* Effect.tryPromise(() =>
              database
                .select({ id: course.id })
                .from(course)
                .where(and(eq(course.id, courseId), eq(course.userId, userId)))
                .limit(1)
            );
            if (ownedCourseRows.at(0) === undefined) {
              return yield* Effect.fail(new CourseNotFound({ courseId }));
            }
          }

          const badgeSelection = {
            courseId: courseBadge.courseId,
            earnedAt: courseBadge.earnedAt,
            id: courseBadge.id,
            label: courseBadge.label,
          } as const;
          const insertedBadgeRows = yield* Effect.tryPromise(() =>
            database
              .insert(courseBadge)
              .values({
                courseId,
                id: generateId("badge"),
                label,
                userId,
              })
              .onConflictDoNothing()
              .returning(badgeSelection)
          );
          const insertedBadgeRow = insertedBadgeRows.at(0);
          if (insertedBadgeRow !== undefined) {
            return toBadgeRecord(insertedBadgeRow);
          }

          // Already earned: return the existing badge instead of minting a
          // duplicate when a course is completed again.
          const existingBadgeRows = yield* Effect.tryPromise(() =>
            database
              .select(badgeSelection)
              .from(courseBadge)
              .where(
                courseId === null
                  ? and(
                      eq(courseBadge.userId, userId),
                      isNull(courseBadge.courseId),
                      eq(courseBadge.label, label)
                    )
                  : and(
                      eq(courseBadge.userId, userId),
                      eq(courseBadge.courseId, courseId)
                    )
              )
              .limit(1)
          );
          const existingBadgeRow = existingBadgeRows.at(0);
          if (existingBadgeRow === undefined) {
            throw new Error("Badge insert and lookup both returned no rows");
          }
          return toBadgeRecord(existingBadgeRow);
        })
      ),

    deleteBadge: ({ badgeId, userId }) =>
      withCourseError("deleteBadge")(
        Effect.gen(function* removeBadge() {
          const deletedBadgeRows = yield* Effect.tryPromise(() =>
            database
              .delete(courseBadge)
              .where(
                and(eq(courseBadge.id, badgeId), eq(courseBadge.userId, userId))
              )
              .returning({ id: courseBadge.id })
          );
          if (deletedBadgeRows.length === 0) {
            return yield* Effect.fail(new BadgeNotFound({ badgeId }));
          }
          return yield* Effect.void;
        })
      ),
  };
}
