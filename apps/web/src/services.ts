import { createHash } from "node:crypto";

import { createCurioRuntime } from "@curio/api/composition/runtime";
import { toStoredLessonContent } from "@curio/api/domain/lesson-content";
import { ModelCredentialRequired } from "@curio/api/domain/model-settings";
import { createApiKeyCipher } from "@curio/api/infrastructure/api-key-cipher";
import type { ArtifactPublisherFunction } from "@curio/api/infrastructure/artifact-create-tool";
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
import { persistCommittedPartial } from "./utils/durable-chat";
import { logger } from "./utils/logger";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);

const chatStore = createDrizzleChatStore(db);
const chatRunStore = createDrizzleChatRunStore(db);
const courseStore = createDrizzleCourseStore(db);
const apiKeyCipher = createApiKeyCipher(
  ENV.MODEL_SETTINGS_ENCRYPTION_KEY ?? ENV.BETTER_AUTH_SECRET
);

const chatModelProvider = createOpenAiCompatibleChatModelProvider({
  // "responses" for Grok/GPT Luna models, "chat-completions" for GLM/Kimi/...
  protocol: ENV.AI_PROTOCOL,
  apiKey: ENV.AI_API_KEY,
  baseUrl: ENV.AI_BASE_URL,
  // OpenCode Go routes requests per conversation via this header
  modelId: ENV.AI_MODEL,
  sessionHeaderName: OPENCODE_SESSION_HEADER_NAME,
  supportsStructuredOutputs: ENV.AI_STRUCTURED_OUTPUTS,
});

const artifactPublisher = ENV.ARTIFACT_SERVER_URL
  ? createMcpArtifactPublisher({
      apiKey: ENV.ARTIFACT_SERVER_API_KEY,
      mcpUrl: ENV.ARTIFACT_SERVER_URL,
      projectName: "Curio",
    })
  : null;

/**
 * Non-blocking startup diagnostic. `/health` proves the process is listening;
 * the MCP initialize probe proves the configured bearer key is accepted, so a
 * stale `ARTIFACT_SERVER_API_KEY` is visible at boot instead of only when the
 * Director tries to publish.
 */
if (ENV.ARTIFACT_SERVER_URL !== undefined) {
  const artifactServerUrl = ENV.ARTIFACT_SERVER_URL;
  const apiKey = ENV.ARTIFACT_SERVER_API_KEY;
  void (async () => {
    const healthUrl = new URL("/health", artifactServerUrl);
    try {
      const healthResponse = await fetch(healthUrl, {
        signal: AbortSignal.timeout(2500),
      });
      if (!healthResponse.ok) {
        logger.warn(
          "Artifact Server health check failed",
          `${healthUrl.origin} responded ${healthResponse.status}`
        );
        return;
      }
      logger.info("Artifact Server health check passed", healthUrl.origin);
    } catch (probeError: unknown) {
      logger.warn(
        `Artifact Server is not reachable at ${healthUrl.origin}. Start it or fix ARTIFACT_SERVER_URL.`,
        probeError
      );
      return;
    }

    if (apiKey === undefined) {
      logger.warn(
        "ARTIFACT_SERVER_API_KEY is not set; the Artifact Server will reject /mcp with 401. Copy the server's API token into apps/web/.env and restart Curio."
      );
      return;
    }

    const keyFingerprint = createHash("sha256")
      .update(apiKey)
      .digest("hex")
      .slice(0, 12);
    try {
      const mcpResponse = await fetch(artifactServerUrl, {
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            capabilities: {},
            clientInfo: { name: "curio-boot-probe", version: "0.1.0" },
            protocolVersion: "2024-11-05",
          },
        }),
        headers: {
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: AbortSignal.timeout(3000),
      });
      try {
        await mcpResponse.body?.cancel();
      } catch {
        // The status is all this probe needs.
      }
      if (mcpResponse.ok) {
        logger.info(
          `Artifact Server MCP auth passed (key ${keyFingerprint})`,
          artifactServerUrl
        );
        return;
      }
      logger.warn(
        `Artifact Server rejected ARTIFACT_SERVER_API_KEY (key ${keyFingerprint}, HTTP ${mcpResponse.status}). ` +
          "The running process holds a stale key: copy the current token into apps/web/.env and restart the Curio dev server. " +
          "Local token file: artifact-server/.artifact-server/local-api-token.",
        artifactServerUrl
      );
    } catch (probeError: unknown) {
      logger.warn(
        "Artifact Server MCP auth probe failed",
        artifactServerUrl,
        probeError
      );
    }
  })();
}

export const curioRuntime = createCurioRuntime({
  artifactPublisher,
  chatModelProvider,
  chatRunStore,
  chatStore,
  courseStore,
  modelSettingsStore: createDrizzleModelSettingsStore(db, apiKeyCipher),
});

/**
 * Boot-time sweep for runs orphaned by a previous server restart: their
 * writer died before settling them, so a chat reopened without a live run
 * would stay submit-blocked forever otherwise (runs untouched for the same
 * staleness window the reconnect path uses are honest crash victims).
 */
const STALE_RUN_THRESHOLD_MS = 300_000;
void (async () => {
  try {
    await curioRuntime.runPromise(
      Effect.gen(function* crashOrphanedRuns() {
        const chatRunStoreService = yield* ChatRunStore;
        const crashedRuns = yield* chatRunStoreService.crashStaleRuns(
          STALE_RUN_THRESHOLD_MS
        );
        for (const crashedRun of crashedRuns) {
          yield* persistCommittedPartial(
            crashedRun.id,
            crashedRun.chatId,
            crashedRun.userId
          ).pipe(
            Effect.catch((recoveryError) =>
              Effect.logError(
                "Failed to persist a crashed run's partial message",
                crashedRun.id,
                recoveryError
              )
            )
          );
        }
        if (crashedRuns.length > 0) {
          yield* Effect.logInfo(
            `Marked ${crashedRuns.length} stale agent run(s) as crashed at boot`
          );
        }
      })
    );
  } catch (error) {
    await Effect.runPromise(
      Effect.logError("Boot-time stale run sweep failed", error)
    );
  }
})();

export const runtimeScopedArtifactPublisher: ArtifactPublisherFunction = {
  publish: (publicationInput) =>
    curioRuntime.runPromise(
      Effect.gen(function* runtimePublish() {
        const artifactPublisherService = yield* ArtifactPublisher;
        return yield* artifactPublisherService.publish(publicationInput);
      })
    ),
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
            kind: lesson.kind,
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
        if (userSettingsOption.provider === "openai-compatible") {
          if (
            userSettingsOption.apiKey === null ||
            userSettingsOption.baseUrl === null
          ) {
            return yield* Effect.fail(
              new ModelCredentialRequired({
                baseUrl: userSettingsOption.baseUrl ?? "",
                provider: userSettingsOption.provider,
              })
            );
          }
          return createUserChatModel(
            {
              apiKey: userSettingsOption.apiKey,
              baseUrl: userSettingsOption.baseUrl,
              model: userSettingsOption.model,
              provider: userSettingsOption.provider,
              sessionHeaderName: OPENCODE_SESSION_HEADER_NAME,
            },
            chatId
          );
        }
        return createUserChatModel(
          {
            apiKey: userSettingsOption.apiKey,
            model: userSettingsOption.model,
            provider: userSettingsOption.provider,
            sessionHeaderName: OPENCODE_SESSION_HEADER_NAME,
          },
          chatId,
          { serverOpenAiApiKey: ENV.AI_API_KEY }
        );
      }
      const chatModelProviderService = yield* ChatModelProvider;
      return yield* chatModelProviderService.getChatModel(chatId);
    })
  );
}
