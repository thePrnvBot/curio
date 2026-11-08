import { guessMediaTypeFromFilename } from "@curio/api/domain/artifact";
import { Option, Schema, SchemaTransformation } from "effect";

import type { ArtifactUIData } from "./ui-messages";

/**
 * Untrusted chat payloads (message parts, tool inputs, stream results) are
 * declared ONCE with Effect Schema here; the same definition provides the
 * static type and the runtime decoder, so call sites never hand-roll checks.
 * Decodes flow into Option-wrapped views: "absent" is a typed `Option.none`,
 * so call sites match on the Option instead of null-checking or carrying
 * `undefined` through the rendering path.
 */

const ArtifactPayload = Schema.Struct({
  content: Schema.String,
  filename: Schema.optional(Schema.String),
  mediaType: Schema.optional(Schema.String),
  reviewUrl: Schema.optional(Schema.String),
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

export interface ArtifactToolInputView {
  readonly filename: Option.Option<string>;
  readonly mediaType: Option.Option<string>;
  readonly title: Option.Option<string>;
}

export interface InlineArtifactView {
  readonly mediaType: Option.Option<string>;
  readonly title: Option.Option<string>;
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
  /** Id of the persisted chat message carrying the inline artifact card. */
  readonly messageId: string;
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

/** The streamed create_lesson tool only reports progress once a lesson is
 * done, so `done` must decode literally `true` for a chunk note to render. */
const LessonChunkOutputPayload = Schema.Struct({
  done: Schema.Literal(true),
  position: Schema.optional(Schema.Number),
  title: Schema.optional(Schema.String),
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
  messageId: Schema.String,
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

/** Schema-guaranteed decoders: schema mismatch decodes to `Option.none`. */
const toOptionalDecode = Schema.decodeUnknownOption;

const decodeArtifactDataPayload = toOptionalDecode(ArtifactPayload);

/** Inline artifact cards render from tool inputs, data parts, and provider
 * outputs; all three share one decoded shape. A tool input may omit
 * `mediaType` (the publisher infers it from the filename), so the renderer
 * resolves the same fallback instead of dropping the card. */
export function toArtifactData(input: unknown): Option.Option<ArtifactUIData> {
  return Option.map(decodeArtifactDataPayload(input), (decoded) => ({
    content: decoded.content,
    mediaType:
      decoded.mediaType ??
      (decoded.filename === undefined
        ? undefined
        : guessMediaTypeFromFilename(decoded.filename)) ??
      "text/plain",
    reviewUrl: Option.fromNullishOr(decoded.reviewUrl),
    summary: Option.fromNullishOr(decoded.summary),
    title: Option.fromNullishOr(decoded.title),
  }));
}

const decodePendingQuestionsPayload = toOptionalDecode(PendingQuestionsPayload);

export function toPendingQuestions(
  input: unknown
): Option.Option<PendingQuestions> {
  return Option.flatMap(decodePendingQuestionsPayload(input), (decoded) => {
    // The questionnaire panel steps one question at a time; a question
    // with fewer than two options cannot offer a meaningful choice.
    const usableQuestions = decoded.questions.filter(
      (question) => question.options.length >= 2
    );
    if (usableQuestions.length === 0) {
      return Option.none<PendingQuestions>();
    }
    return Option.some({
      intro: decoded.intro,
      questions: usableQuestions,
    });
  });
}

const decodeCourseCreatedPayload = toOptionalDecode(CourseCreatedPayload);

export function toCourseCreatedData(
  input: unknown
): Option.Option<CourseCreatedView> {
  return Option.map(decodeCourseCreatedPayload(input), (decoded) => ({
    lessonCount: decoded.course.lessonCount,
    title: decoded.course.title,
  }));
}

const decodeLessonChunkPayload = toOptionalDecode(LessonChunkOutputPayload);

export interface LessonChunkView {
  readonly position: number;
  readonly title: string;
}

export function toLessonChunkData(
  input: unknown
): Option.Option<LessonChunkView> {
  return Option.map(decodeLessonChunkPayload(input), (decoded) => ({
    position: Option.getOrElse(Option.fromNullishOr(decoded.position), () => 0),
    title: Option.getOrElse(Option.fromNullishOr(decoded.title), () => ""),
  }));
}

const decodeHeightProbePayload = toOptionalDecode(ArtifactHeightProbePayload);

export function decodeArtifactHeight(input: unknown): Option.Option<number> {
  return Option.map(
    decodeHeightProbePayload(input),
    (decoded) => decoded.height
  );
}

const decodeGeneratedResponse = toOptionalDecode(
  GeneratedArtifactResponsePayload
);

export function toGeneratedArtifactResponse(
  input: unknown
): Option.Option<GeneratedArtifactResponseView> {
  return decodeGeneratedResponse(input);
}

const decodeGeneratedError = toOptionalDecode(GeneratedArtifactErrorPayload);

export function decodeGeneratedArtifactError(
  input: unknown
): Option.Option<string> {
  return Option.map(decodeGeneratedError(input), (decoded) => decoded.error);
}

const decodeArtifactToolInput = toOptionalDecode(ArtifactToolInputPayload);

export function toArtifactToolEntry(
  input: unknown
): Option.Option<ArtifactToolInputView> {
  return Option.map(decodeArtifactToolInput(input), (decoded) => ({
    filename: Option.fromNullishOr(decoded.filename),
    mediaType: Option.fromNullishOr(decoded.mediaType),
    title: Option.fromNullishOr(decoded.title),
  }));
}

const decodeInlineArtifact = toOptionalDecode(InlineArtifactPayload);

export function toInlineDataArtifact(
  input: unknown
): Option.Option<InlineArtifactView> {
  return Option.map(decodeInlineArtifact(input), (decoded) => ({
    mediaType: Option.fromNullishOr(decoded.mediaType),
    title: Option.fromNullishOr(decoded.title),
  }));
}

/* ------------------------------------------------------------------------
 * Web tool outputs
 *
 * The Director's web_search / web_read results stream back as opaque tool
 * parts. Their shapes are declared once here, so the cards decode the
 * committed output instead of sniffing properties to guess which tool it
 * came from — the tool name already decides which decoder applies.
 * ---------------------------------------------------------------------- */

const WebSearchResultPayload = Schema.Struct({
  snippet: Schema.String,
  title: Schema.String,
  url: Schema.String,
});

const WebSearchToolOutputPayload = Schema.Struct({
  blocked: Schema.optional(Schema.Boolean),
  error: Schema.optional(Schema.String),
  note: Schema.optional(Schema.String),
  results: Schema.optional(Schema.Array(WebSearchResultPayload)),
});

const WebReadToolOutputPayload = Schema.Struct({
  error: Schema.optional(Schema.String),
  markdown: Schema.optional(Schema.String),
  note: Schema.optional(Schema.String),
  truncated: Schema.optional(Schema.Boolean),
  url: Schema.optional(Schema.String),
});

const WebReadToolInputPayload = Schema.Struct({
  selector: Schema.optional(Schema.String),
  url: Schema.String,
});

export interface WebSearchResultView {
  readonly snippet: string;
  readonly title: string;
  readonly url: string;
}

export interface WebSearchToolOutputView {
  readonly blocked: boolean;
  readonly error: Option.Option<string>;
  readonly note: Option.Option<string>;
  readonly results: readonly WebSearchResultView[];
}

export interface WebReadToolOutputView {
  readonly error: Option.Option<string>;
  readonly markdown: string;
  readonly note: Option.Option<string>;
  readonly truncated: boolean;
  readonly url: Option.Option<string>;
}

const decodeWebSearchToolOutput = toOptionalDecode(WebSearchToolOutputPayload);

export function toWebSearchToolOutput(
  input: unknown
): Option.Option<WebSearchToolOutputView> {
  return Option.map(decodeWebSearchToolOutput(input), (decoded) => ({
    blocked: Option.getOrElse(
      Option.fromNullishOr(decoded.blocked),
      () => false
    ),
    error: Option.fromNullishOr(decoded.error),
    note: Option.fromNullishOr(decoded.note),
    results: Option.getOrElse(Option.fromNullishOr(decoded.results), () => []),
  }));
}

const decodeWebReadToolOutput = toOptionalDecode(WebReadToolOutputPayload);

export function toWebReadToolOutput(
  input: unknown
): Option.Option<WebReadToolOutputView> {
  return Option.map(decodeWebReadToolOutput(input), (decoded) => ({
    error: Option.fromNullishOr(decoded.error),
    markdown: Option.getOrElse(
      Option.fromNullishOr(decoded.markdown),
      () => ""
    ),
    note: Option.fromNullishOr(decoded.note),
    truncated: Option.getOrElse(
      Option.fromNullishOr(decoded.truncated),
      () => false
    ),
    url: Option.fromNullishOr(decoded.url),
  }));
}

const decodeWebReadToolInput = toOptionalDecode(WebReadToolInputPayload);

/** The URL a web_read call asked for; used by the session link index. */
export function toWebReadToolUrl(input: unknown): Option.Option<string> {
  return Option.flatMap(decodeWebReadToolInput(input), (decoded) =>
    decoded.url === "" ? Option.none<string>() : Option.some(decoded.url)
  );
}

/* ------------------------------------------------------------------------
 * Artifact render plans
 *
 * A media type alone does not say how an artifact renders: it says whether
 * the artifact is a sandboxed HTML embed, an inline SVG image, rendered
 * markdown, highlighted code, or an unrecognized payload shown as plain
 * text. The mapping mediaType → render plan is untrusted stream/tool data,
 * so it is declared ONCE here as Effect Schema literal decodes — callers
 * receive a discriminated union and dispatch exhaustively on `kind`.
 * ---------------------------------------------------------------------- */

export type ArtifactCodeLanguage = "css" | "javascript" | "json";

export type ArtifactRenderPlan =
  | {
      readonly kind: "code";
      readonly language: ArtifactCodeLanguage;
      readonly mediaType: string;
    }
  | { readonly kind: "embed"; readonly mediaType: string }
  | { readonly kind: "markdown"; readonly mediaType: string }
  | { readonly kind: "plain" }
  | { readonly kind: "svg"; readonly mediaType: string };

const ARTIFACT_CODE_LANGUAGE_BY_MEDIA_TYPE: Record<
  "application/json" | "text/css" | "text/javascript",
  ArtifactCodeLanguage
> = {
  "application/json": "json",
  "text/css": "css",
  "text/javascript": "javascript",
};

const CODE_ARTIFACT_MEDIA_TYPE = Schema.Literals([
  "application/json",
  "text/css",
  "text/javascript",
]);

const toTaggedMediaPlan = (
  planKind: "embed" | "markdown" | "svg",
  mediaType: string
) =>
  Schema.Literals([mediaType]).pipe(
    Schema.decodeTo(
      Schema.Struct({ kind: Schema.tag(planKind), mediaType: Schema.String }),
      SchemaTransformation.transform({
        decode: () => ({ kind: planKind, mediaType }),
        encode: (plan: { readonly mediaType: string }) => plan.mediaType,
      })
    )
  );

const htmlEmbedArtifactPlan = toTaggedMediaPlan("embed", "text/html");
const svgArtifactPlan = toTaggedMediaPlan("svg", "image/svg+xml");
const markdownArtifactPlan = toTaggedMediaPlan("markdown", "text/markdown");

const codeArtifactPlan = CODE_ARTIFACT_MEDIA_TYPE.pipe(
  Schema.decodeTo(
    Schema.Struct({
      kind: Schema.tag("code"),
      language: Schema.Literals(["css", "javascript", "json"]),
      mediaType: CODE_ARTIFACT_MEDIA_TYPE,
    }),
    SchemaTransformation.transform({
      decode: (mediaType) => ({
        kind: "code" as const,
        language: ARTIFACT_CODE_LANGUAGE_BY_MEDIA_TYPE[mediaType],
        mediaType,
      }),
      encode: (plan) => plan.mediaType,
    })
  )
);

const ArtifactRenderPlanPayload = Schema.Union([
  codeArtifactPlan,
  htmlEmbedArtifactPlan,
  markdownArtifactPlan,
  svgArtifactPlan,
]);

const decodeArtifactRenderPlanPayload = toOptionalDecode(
  ArtifactRenderPlanPayload
);

/**
 * Classifies a media type into the render plan the previewer dispatches on.
 * Recognized media types decode through the schema; anything else degrades
 * to the `plain` plan, which the previewer renders un-highlighted.
 */
export function toArtifactRenderPlan(mediaType: string): ArtifactRenderPlan {
  return Option.getOrElse(decodeArtifactRenderPlanPayload(mediaType), () => ({
    kind: "plain",
  }));
}
