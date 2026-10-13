import { Option, Schema } from "effect";

import type { ArtifactUIData } from "./ui-messages";

/**
 * Untrusted chat payloads (message parts, tool inputs, stream results) are
 * declared ONCE with Effect Schema here; the same definition provides the
 * static type and the runtime decoder, so call sites never hand-roll checks.
 * Failed decodes degrade to `null` and the callers' existing empty/error
 * paths handle them.
 */

const ArtifactPayload = Schema.Struct({
  content: Schema.String,
  mediaType: Schema.String,
  summary: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
});

export interface ChatAnswerOption {
  readonly question: string;
  readonly options: readonly string[];
}

export interface PendingQuestions {
  readonly intro: string;
  readonly questions: readonly ChatAnswerOption[];
}

interface ArtifactToolInputView {
  readonly filename?: string;
  readonly mediaType?: string;
  readonly title?: string;
}

interface InlineArtifactView {
  readonly mediaType?: string;
  readonly title?: string;
}

export interface CourseCreatedView {
  readonly lessonCount: number;
  readonly title: string;
}

export interface GeneratedArtifactResponseView {
  readonly brief: {
    readonly content: string;
    readonly mediaType: string;
    readonly summary: string;
    readonly title: string;
  };
  readonly links: {
    readonly review: string;
  };
}

const PendingQuestionsPayload = Schema.Struct({
  intro: Schema.String,
  questions: Schema.Array(
    Schema.Struct({
      options: Schema.Array(Schema.String),
      question: Schema.String,
    })
  ),
});

const CourseCreatedPayload = Schema.Struct({
  course: Schema.Struct({
    lessonCount: Schema.Number,
    title: Schema.String,
  }),
});

const ArtifactHeightProbePayload = Schema.Struct({
  height: Schema.Number,
  type: Schema.Literal("curio-artifact-height"),
});

const GeneratedArtifactResponsePayload = Schema.Struct({
  brief: Schema.Struct({
    content: Schema.String,
    mediaType: Schema.String,
    summary: Schema.String,
    title: Schema.String,
  }),
  links: Schema.Struct({
    review: Schema.String,
  }),
});

const GeneratedArtifactErrorPayload = Schema.Struct({
  error: Schema.String,
});

const ArtifactToolInputPayload = Schema.Struct({
  filename: Schema.optional(Schema.String),
  mediaType: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
});

const InlineArtifactPayload = Schema.Struct({
  mediaType: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
});

function toNullish<S extends Schema.ConstraintDecoder<unknown>>(
  schema: S
): (input: unknown) => S["Type"] | null {
  const decode = Schema.decodeUnknownOption(schema);
  return (input: unknown) =>
    Option.match(decode(input), {
      onNone: () => null,
      onSome: (value) => value,
    });
}

const decodeArtifactDataPayload = toNullish(ArtifactPayload);

/** Inline artifact cards render from tool inputs, data parts, and provider
 * outputs; all three share one decoded shape. */
export function toArtifactData(input: unknown): ArtifactUIData | null {
  const decoded = decodeArtifactDataPayload(input);
  if (decoded === null) {
    return null;
  }
  return {
    content: decoded.content,
    mediaType: decoded.mediaType,
    reviewUrl: undefined,
    summary: decoded.summary,
    title: decoded.title,
  };
}

const decodePendingQuestionsPayload = toNullish(PendingQuestionsPayload);

export function toPendingQuestions(input: unknown): PendingQuestions | null {
  const decoded = decodePendingQuestionsPayload(input);
  if (decoded === null || decoded.questions.length === 0) {
    return null;
  }
  const usableQuestions = decoded.questions.filter(
    (question) => question.options.length >= 2
  );
  if (usableQuestions.length === 0) {
    return null;
  }
  return {
    intro: decoded.intro,
    questions: usableQuestions,
  };
}

const decodeCourseCreatedPayload = toNullish(CourseCreatedPayload);

export function toCourseCreatedData(input: unknown): CourseCreatedView | null {
  const decoded = decodeCourseCreatedPayload(input);
  if (decoded === null) {
    return null;
  }
  return {
    lessonCount: decoded.course.lessonCount,
    title: decoded.course.title,
  };
}

const decodeHeightProbePayload = toNullish(ArtifactHeightProbePayload);

export function decodeArtifactHeight(input: unknown): number | null {
  const decoded = decodeHeightProbePayload(input);
  return decoded === null ? null : decoded.height;
}

const decodeGeneratedResponse = toNullish(GeneratedArtifactResponsePayload);

export function toGeneratedArtifactResponse(
  input: unknown
): GeneratedArtifactResponseView | null {
  return decodeGeneratedResponse(input);
}

const decodeGeneratedError = toNullish(GeneratedArtifactErrorPayload);

export function decodeGeneratedArtifactError(input: unknown): string | null {
  const decoded = decodeGeneratedError(input);
  return decoded === null ? null : decoded.error;
}

const decodeArtifactToolInput = toNullish(ArtifactToolInputPayload);

export function toArtifactToolEntry(
  input: unknown
): ArtifactToolInputView | null {
  return decodeArtifactToolInput(input);
}

const decodeInlineArtifact = toNullish(InlineArtifactPayload);

export function toInlineDataArtifact(input: unknown): InlineArtifactView | null {
  return decodeInlineArtifact(input);
}
