import { createCurioRuntime } from "@curio/api/composition/runtime";
import { ArtifactPublishFailed } from "@curio/api/domain/artifact-publish-failed";
import type {
  CreateLessonToolRequest,
  CreateLessonToolResult,
  CourseChunkPlanToolRequest,
  CourseScaffoldToolResult,
  LessonContentToolPayload,
} from "@curio/api/infrastructure/course-create-tool";
import { createDrizzleChatStore } from "@curio/api/infrastructure/drizzle-chat-store";
import { createDrizzleChatRunStore } from "@curio/api/infrastructure/drizzle-chat-run-store";
import { createDrizzleCourseStore } from "@curio/api/infrastructure/drizzle-course-store";
import { createDrizzleModelSettingsStore } from "@curio/api/infrastructure/drizzle-model-settings-store";
import { createMcpArtifactPublisher } from "@curio/api/infrastructure/mcp-artifact-publisher";
import { createOpenAiCompatibleChatModelProvider } from "@curio/api/infrastructure/openai-chat-model-provider";
import { createUserChatModel } from "@curio/api/infrastructure/user-chat-model";
import type { ArtifactPublisherContract } from "@curio/api/services/artifact-publisher";
import { ArtifactPublisher } from "@curio/api/services/artifact-publisher";
import { ChatModelProvider } from "@curio/api/services/chat-model-provider";
import { CourseStore } from "@curio/api/services/course-store";
import { ModelSettingsStore } from "@curio/api/services/model-settings-store";
import type { CourseLessonKind, LessonContent } from "@curio/api/domain/course";
import { COURSE_LESSON_KINDS } from "@curio/api/domain/course";
import type { LanguageModel } from "ai";
import { createAuth } from "@curio/auth";
import { createDb } from "@curio/db";
import { Effect } from "effect";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);

const chatStore = createDrizzleChatStore(db);
const chatRunStore = createDrizzleChatRunStore(db);
const courseStore = createDrizzleCourseStore(db);

const chatModelProvider = createOpenAiCompatibleChatModelProvider({
  // "responses" for Grok/GPT Luna models, "chat-completions" for GLM/Kimi/...
  protocol: ENV.AI_PROTOCOL,
  apiKey: ENV.AI_API_KEY,
  baseUrl: ENV.AI_BASE_URL,
  // OpenCode Go routes requests per conversation via this header
  modelId: ENV.AI_MODEL,
  sessionHeaderName: "x-opencode-session",
});

const artifactPublisher = ENV.ARTIFACT_SERVER_URL
  ? createMcpArtifactPublisher({
      apiKey: ENV.ARTIFACT_SERVER_API_KEY,
      mcpUrl: ENV.ARTIFACT_SERVER_URL,
      projectName: "Curio",
    })
  : null;

export const curioRuntime = createCurioRuntime({
  artifactPublisher,
  chatModelProvider,
  chatRunStore,
  chatStore,
  courseStore,
  modelSettingsStore: createDrizzleModelSettingsStore(db),
});

export const runtimeScopedArtifactPublisher: ArtifactPublisherContract = {
  publish: (publicationInput) =>
    Effect.tryPromise({
      catch: (cause: unknown) =>
        new ArtifactPublishFailed({
          cause,
          title: publicationInput.title,
        }),
      try: () =>
        curioRuntime.runPromise(
          Effect.gen(function* runtimePublish() {
            const artifactPublisherService = yield* ArtifactPublisher;
            return yield* artifactPublisherService.publish(publicationInput);
          })
        ),
    }),
};

export const curioFeatures = {
  artifactPublishingEnabled: artifactPublisher !== null,
} as const;

/**
 * Streamed chunk 1: creates the course shell (sections + empty lesson
 * placeholders) for the Director's `create_course` plan call.
 */
export async function createScopedCourseScaffold(
  userId: string,
  planRequest: CourseChunkPlanToolRequest
): Promise<CourseScaffoldToolResult> {
  const scaffold = await curioRuntime.runPromise(
    Effect.gen(function* createScopedScaffold() {
      const courseStoreService = yield* CourseStore;
      return yield* courseStoreService.createCourseScaffold({
        description: planRequest.description ?? "",
        sections: planRequest.sections.map((section) => ({
          lessons: section.lessons.map((lesson) => ({
            kind: normalizeLessonKind(lesson.kind),
            title: lesson.title,
          })),
          title: section.title,
        })),
        title: planRequest.title,
        userId,
      });
    })
  );
  return scaffold;
}

/**
 * Streamed chunk 2..N: fills one lesson's finished content for the
 * Director's `create_lesson` calls.
 */
export async function createScopedCourseLesson(
  userId: string,
  createLessonRequest: CreateLessonToolRequest
): Promise<CreateLessonToolResult> {
  const storedContent = toStoredLessonContent(
    createLessonRequest.content
  );
  const written = await curioRuntime.runPromise(
    Effect.gen(function* createScopedLesson() {
      const courseStoreService = yield* CourseStore;
      return yield* courseStoreService.writeCourseLessonContent({
        content: storedContent,
        courseId: createLessonRequest.courseId,
        lessonId: createLessonRequest.lessonId,
        userId,
      });
    })
  );
  return {
    done: true,
    lessonId: written.lessonId,
    position: written.position,
    title: written.title,
  };
}

/** The model supplies lesson kinds as free strings; anything unrecognized
 * degrades to `cards` rather than failing the whole creation. */
function normalizeLessonKind(kind: string): CourseLessonKind {
  return (
    COURSE_LESSON_KINDS.find((candidate) => candidate === kind) ?? "cards"
  );
}

/**
 * Resolves the chat model for one conversation: the user's saved provider
 * choice (OpenAI or OpenAI-compatible, from the settings dashboard) wins;
 * without one the server default provider applies.
 */
export async function createScopedModel(
  userId: string,
  chatId: string
): Promise<LanguageModel> {
  return await curioRuntime.runPromise(
    Effect.gen(function* resolveScopedModel() {
      const modelSettingsStore = yield* ModelSettingsStore;
      const userSettings = yield* modelSettingsStore.getUserModelSettings(
        userId
      );
      if (
        userSettings !== null &&
        (userSettings.provider === "openai" ||
          userSettings.provider === "openai-compatible")
      ) {
        return createUserChatModel({
          chatId,
          fallbackApiKey: ENV.AI_API_KEY,
          fallbackBaseUrl: ENV.AI_BASE_URL,
          settings: userSettings,
        });
      }
      const chatModelProviderService = yield* ChatModelProvider;
      return yield* chatModelProviderService.getChatModel(chatId);
    })
  );
}

/** Tool content is already validated by the tool's zod schema; this only
 * normalizes kinds/defaults into the stored `LessonContent` union. */
function toStoredLessonContent(
  rawContent: LessonContentToolPayload
): LessonContent {
  switch (rawContent.kind) {
    case "animation": {
      return {
        body: rawContent.body,
        html: rawContent.html,
        kind: "animation",
      };
    }
    case "cards": {
      return {
        body: rawContent.body,
        cards: rawContent.cards.map((card) => ({
          body: card.body,
          title: card.title,
        })),
        kind: "cards",
      };
    }
    case "recap": {
      return {
        kind: "recap",
        questions: rawContent.questions.map((question) => ({
          answerIndex: Math.max(
            0,
            Math.min(question.answerIndex, question.options.length - 1)
          ),
          explanation: question.explanation,
          options: question.options,
          prompt: question.prompt,
        })),
      };
    }
    case "guided-explanation": {
      return {
        intro: rawContent.intro,
        kind: "guided-explanation",
        steps: rawContent.steps.map((step) => ({
          durationMs: step.durationMs,
          narration: step.narration,
          visual: {
            kind: step.visual.kind,
            language: step.visual.language,
            source: step.visual.source,
          },
        })),
      };
    }
    case "video": {
      return {
        body: rawContent.body,
        kind: "video",
        videoUrl: rawContent.videoUrl,
      };
    }
    default: {
      return {
        body: "",
        cards: [],
        kind: "cards",
      };
    }
  }
}
