import { createCurioRuntime } from "@curio/api/composition/runtime";
import { ArtifactPublishFailed } from "@curio/api/domain/artifact-publish-failed";
import type {
  CourseLessonInput,
  CourseLessonKind,
} from "@curio/api/domain/course";
import { COURSE_LESSON_KINDS } from "@curio/api/domain/course";
import type {
  CourseCreationToolRequest,
  CourseCreationToolResult,
} from "@curio/api/infrastructure/course-create-tool";
import { createDrizzleChatStore } from "@curio/api/infrastructure/drizzle-chat-store";
import { createDrizzleCourseStore } from "@curio/api/infrastructure/drizzle-course-store";
import { createMcpArtifactPublisher } from "@curio/api/infrastructure/mcp-artifact-publisher";
import { createOpenAiCompatibleChatModelProvider } from "@curio/api/infrastructure/openai-chat-model-provider";
import type { ArtifactPublisherContract } from "@curio/api/services/artifact-publisher";
import { ArtifactPublisher } from "@curio/api/services/artifact-publisher";
import { CourseStore } from "@curio/api/services/course-store";
import { createAuth } from "@curio/auth";
import { createDb } from "@curio/db";
import { Effect } from "effect";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);

const chatStore = createDrizzleChatStore(db);
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
  chatStore,
  courseStore,
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
 * Creates a course for the given user through the Curio runtime. Bound to the
 * Director's `create_course` chat tool per request, where the session user is
 * already resolved.
 */
export async function createScopedCourse(
  userId: string,
  creationRequest: CourseCreationToolRequest
): Promise<CourseCreationToolResult> {
  const createdCourse = await curioRuntime.runPromise(
    Effect.gen(function* createScopedCourse() {
      const courseStoreService = yield* CourseStore;
      return yield* courseStoreService.createCourse({
        description: creationRequest.description ?? "",
        lessons: toLessonInputs(creationRequest.lessons),
        title: creationRequest.title,
        userId,
      });
    })
  );
  return {
    course: {
      id: createdCourse.id,
      lessonCount: createdCourse.lessonCount,
      title: createdCourse.title,
    },
  };
}

/** The model supplies lesson kinds as free strings; anything unrecognized
 * degrades to `cards` rather than failing the whole creation. */
function toLessonInputs(
  lessons: readonly { kind: string; title: string }[]
): readonly CourseLessonInput[] {
  return lessons.map((lesson) => ({
    kind: (COURSE_LESSON_KINDS as readonly string[]).includes(lesson.kind)
      ? (lesson.kind as CourseLessonKind)
      : "cards",
    title: lesson.title,
  }));
}
