import { createCurioRuntime } from "@curio/api/composition/runtime";
import { ArtifactPublishFailed } from "@curio/api/domain/artifact";
import { normalizeLessonKind } from "@curio/api/domain/course";
import { toStoredLessonContent } from "@curio/api/domain/lesson-content";
import type {
  CreateLessonToolRequest,
  CreateLessonToolResult,
  CourseChunkPlanToolRequest,
  CourseScaffoldToolResult,
} from "@curio/api/infrastructure/course-create-tool";
import { createDrizzleChatRunStore } from "@curio/api/infrastructure/drizzle-chat-run-store";
import { createDrizzleChatStore } from "@curio/api/infrastructure/drizzle-chat-store";
import { createDrizzleCourseStore } from "@curio/api/infrastructure/drizzle-course-store";
import { createDrizzleModelSettingsStore } from "@curio/api/infrastructure/drizzle-model-settings-store";
import { createMcpArtifactPublisher } from "@curio/api/infrastructure/mcp-artifact-publisher";
import {
  OPENCODE_SESSION_HEADER_NAME,
  createOpenAiCompatibleChatModelProvider,
} from "@curio/api/infrastructure/openai-chat-model-provider";
import { createUserChatModel } from "@curio/api/infrastructure/user-chat-model";
import type { ArtifactPublisherContract } from "@curio/api/services/artifact-publisher";
import { ArtifactPublisher } from "@curio/api/services/artifact-publisher";
import { ChatModelProvider } from "@curio/api/services/chat-model-provider";
import { ChatRunStore } from "@curio/api/services/chat-run-store";
import { CourseStore } from "@curio/api/services/course-store";
import { ModelSettingsStore } from "@curio/api/services/model-settings-store";
import { createAuth } from "@curio/auth";
import { createDb } from "@curio/db";
import type { LanguageModel } from "ai";
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
  sessionHeaderName: OPENCODE_SESSION_HEADER_NAME,
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

/**
 * Boot-time sweep for runs orphaned by a previous server restart: their
 * writer died before settling them, so a chat reopened without a live run
 * would stay submit-blocked forever otherwise (runs untouched for the same
 * staleness window the reconnect path uses are honest crash victims).
 */
const STALE_RUN_THRESHOLD_MS = 300_000;
void curioRuntime.runPromise(
  Effect.gen(function* crashOrphanedRuns() {
    const chatRunStoreService = yield* ChatRunStore;
    const crashedRunIds = yield* chatRunStoreService.crashStaleRuns(
      STALE_RUN_THRESHOLD_MS
    );
    if (crashedRunIds.length > 0) {
      yield* Effect.logInfo(
        `Marked ${crashedRunIds.length} stale agent run(s) as crashed at boot`
      );
    }
  }).pipe(
    Effect.catch((error) =>
      Effect.logError("Boot-time stale run sweep failed", error)
    )
  )
);

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
  const storedContent = toStoredLessonContent(createLessonRequest.content);
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
      const userSettingsOption =
        yield* modelSettingsStore.getUserModelSettings(userId);
      if (userSettingsOption !== null) {
        return createUserChatModel(
          {
            ...userSettingsOption,
            sessionHeaderName: OPENCODE_SESSION_HEADER_NAME,
          },
          chatId,
          { apiKey: ENV.AI_API_KEY, baseUrl: ENV.AI_BASE_URL }
        );
      }
      const chatModelProviderService = yield* ChatModelProvider;
      return yield* chatModelProviderService.getChatModel(chatId);
    })
  );
}
