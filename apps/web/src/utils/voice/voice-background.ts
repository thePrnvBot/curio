/**
 * Site-wide narration prefill.
 *
 * The guided explanation player already prefetches the lesson it has open.
 * This sweep keeps the voice worker busy for the whole signed-in session:
 * every guided lesson in the learner's ACTIVE courses is walked in reading
 * order and any sentence missing from the IndexedDB cache is synthesized.
 * Cache hits are nearly free, so repeated sweeps mostly re-probe existing
 * lines and pick up lessons that were generated (or edited) since the last
 * pass. Completed courses are left to the player's on-open prefetch so the
 * bounded cache is not churned by re-reading finished material.
 */

import type {
  CourseDetail,
  CourseLessonDetail,
  CourseSummary,
  LessonContent,
} from "@curio/api/domain/course";

import { narrationSentences } from "@/components/course/guided-explanation-timing";

/** Flattens a guided explanation into the exact sentence strings the player
 * narrates. Other lesson kinds have no narration and return an empty list. */
export function guidedLessonSentences(
  content: LessonContent | null | undefined
): string[] {
  if (content === null || content === undefined) {
    return [];
  }
  if (content.kind !== "guided-explanation") {
    return [];
  }
  return content.steps.flatMap((step) => narrationSentences(step.narration));
}

export interface VoiceBackgroundSweepDeps {
  /** False to stop between lessons/sentences (preference change, unmount). */
  readonly isCancelled?: () => boolean;
  readonly getCourse: (courseId: string) => Promise<CourseDetail>;
  readonly getLesson: (input: {
    readonly courseId: string;
    readonly lessonId: string;
  }) => Promise<CourseLessonDetail>;
  readonly listCourses: () => Promise<readonly CourseSummary[]>;
  /** Resolves to null when synthesis failed; failures are non-fatal. */
  readonly synthesize: (text: string) => Promise<unknown | null>;
}

export interface VoiceBackgroundSweepResult {
  readonly cancelled: boolean;
  readonly failedLessons: number;
  readonly lessonsVisited: number;
  readonly linesQueued: number;
}

/** Walks every course/lesson sequentially. Server or synthesis failures only
 * skip the affected lesson; the next sweep retries. */
export async function runVoiceBackgroundSweep(
  deps: VoiceBackgroundSweepDeps
): Promise<VoiceBackgroundSweepResult> {
  const cancelled = (): boolean => deps.isCancelled?.() === true;
  const seenSentences = new Set<string>();
  let failedLessons = 0;
  let lessonsVisited = 0;
  let linesQueued = 0;

  let courses: readonly CourseSummary[];
  try {
    courses = await deps.listCourses();
  } catch {
    return {
      cancelled: false,
      failedLessons: 1,
      lessonsVisited: 0,
      linesQueued: 0,
    };
  }

  for (const course of courses) {
    if (cancelled()) {
      return { cancelled: true, failedLessons, lessonsVisited, linesQueued };
    }
    // Completed courses are only prefetched by the player when reopened;
    // sweeping them here would churn the bounded utterance cache. New work
    // is exactly the active course(s) the learner is moving through.
    if (course.status !== "active") {
      continue;
    }
    let detail: CourseDetail;
    try {
      // oxlint-disable-next-line no-await-in-loop -- courses are fetched in order so the most recent course fills first
      detail = await deps.getCourse(course.id);
    } catch {
      failedLessons += 1;
      continue;
    }
    for (const lesson of detail.sections.flatMap(
      (section) => section.lessons
    )) {
      if (cancelled()) {
        return { cancelled: true, failedLessons, lessonsVisited, linesQueued };
      }
      if (lesson.kind !== "guided-explanation" || !lesson.hasContent) {
        continue;
      }
      lessonsVisited += 1;
      let lessonDetail: CourseLessonDetail;
      try {
        // oxlint-disable-next-line no-await-in-loop -- lesson content is fetched in reading order
        lessonDetail = await deps.getLesson({
          courseId: course.id,
          lessonId: lesson.id,
        });
      } catch {
        failedLessons += 1;
        continue;
      }
      for (const sentence of guidedLessonSentences(lessonDetail.content)) {
        if (cancelled()) {
          return {
            cancelled: true,
            failedLessons,
            lessonsVisited,
            linesQueued,
          };
        }
        if (seenSentences.has(sentence)) {
          continue;
        }
        seenSentences.add(sentence);
        // Sequential on purpose: one synthesis engine, and the cache write of
        // each line should land before the next probe.
        // oxlint-disable-next-line no-await-in-loop
        await deps.synthesize(sentence);
        linesQueued += 1;
      }
    }
  }

  return { cancelled: false, failedLessons, lessonsVisited, linesQueued };
}
