import type { LanguageModel } from "ai";
import { Effect, Layer, ManagedRuntime } from "effect";

import { ArtifactPublishFailed } from "../domain/artifact-publish-failed";
import { createCourseStoreLessonGenerator } from "../infrastructure/course-store-lesson-generator";
import { createGenerateTextArtifactGenerator } from "../infrastructure/generate-text-artifact-generator";
import { createGenerateTextChatTitleComposer } from "../infrastructure/generate-text-chat-title-composer";
import { createGenerateTextLessonContent } from "../infrastructure/generate-text-lesson-generator";
import { ArtifactGenerator } from "../services/artifact-generator";
import type { ArtifactPublisherContract } from "../services/artifact-publisher";
import { ArtifactPublisher } from "../services/artifact-publisher";
import type { ChatModelProviderContract } from "../services/chat-model-provider";
import { ChatModelProvider } from "../services/chat-model-provider";
import type { ChatStoreContract } from "../services/chat-store";
import { ChatStore } from "../services/chat-store";
import type { ChatRunStoreContract } from "../services/chat-run-store";
import { ChatRunStore } from "../services/chat-run-store";
import { LessonGenerator } from "../services/lesson-generator";
import type { CourseStoreContract } from "../services/course-store";
import { CourseStore } from "../services/course-store";
import type { ModelSettingsStoreContract } from "../services/model-settings-store";
import { ModelSettingsStore } from "../services/model-settings-store";
import { ChatTitleComposer } from "../services/chat-title-composer";

const LESSON_GENERATION_MODEL_SCOPE_ID = "lesson-generation";

export type CurioRuntime = ManagedRuntime.ManagedRuntime<
  | ChatStore
  | ChatRunStore
  | ChatModelProvider
  | LessonGenerator
  | ArtifactPublisher
  | ChatTitleComposer
  | ArtifactGenerator
  | CourseStore
  | ModelSettingsStore,
  never
>;

const unavailableArtifactPublisherContract: ArtifactPublisherContract = {
  publish: () =>
    Effect.fail(
      new ArtifactPublishFailed({
        cause: "ARTIFACT_SERVER_URL is not configured",
        title: "artifact publishing",
      })
    ),
};

const ARTIFACT_MODEL_SCOPE_ID = "artifact-generation";
const TITLE_MODEL_SCOPE_ID = "chat-title";

export interface CurioApiDependencies {
  readonly artifactPublisher: ArtifactPublisherContract | null;
  readonly chatModelProvider: ChatModelProviderContract;
  readonly chatRunStore: ChatRunStoreContract;
  readonly chatStore: ChatStoreContract;
  readonly courseStore: CourseStoreContract;
  readonly modelSettingsStore: ModelSettingsStoreContract;
}

function resolveChatModel(
  modelProvider: ChatModelProviderContract,
  chatId: string
): Effect.Effect<LanguageModel> {
  return Effect.gen(function* resolveModel() {
    return yield* modelProvider.getChatModel(chatId);
  });
}

function buildCurioLayer(
  dependencies: CurioApiDependencies
): Layer.Layer<
  | ChatStore
  | ChatRunStore
  | ChatModelProvider
  | LessonGenerator
  | ArtifactPublisher
  | ChatTitleComposer
  | ArtifactGenerator
  | CourseStore
  | ModelSettingsStore,
  never,
  never
> {
  const artifactPublisherContract: ArtifactPublisherContract =
    dependencies.artifactPublisher ?? unavailableArtifactPublisherContract;

  const chatModelProviderLayer = Layer.succeed(
    ChatModelProvider,
    dependencies.chatModelProvider
  );

  const chatTitleComposerLayer = Layer.provide(
    Layer.effect(
      ChatTitleComposer,
      Effect.gen(function* makeTitleComposer() {
        const modelProvider = yield* ChatModelProvider;
        return createGenerateTextChatTitleComposer({
          resolveChatModel: resolveChatModel(
            modelProvider,
            TITLE_MODEL_SCOPE_ID
          ),
        });
      })
    ),
    chatModelProviderLayer
  );

  const artifactGeneratorLayer = Layer.provide(
    Layer.effect(
      ArtifactGenerator,
      Effect.gen(function* makeArtifactGenerator() {
        const modelProvider = yield* ChatModelProvider;
        return createGenerateTextArtifactGenerator({
          resolveChatModel: resolveChatModel(
            modelProvider,
            ARTIFACT_MODEL_SCOPE_ID
          ),
        });
      })
    ),
    chatModelProviderLayer
  );

  const lessonGeneratorLayer = Layer.provide(
    Layer.effect(
      LessonGenerator,
      Effect.gen(function* makeLessonGenerator() {
        const courseStore = yield* CourseStore;
        const chatModelProvider = yield* ChatModelProvider;
        return createCourseStoreLessonGenerator({
          courseStore,
          generateLessonContent: createGenerateTextLessonContent({
            resolveChatModel: resolveChatModel(
              chatModelProvider,
              LESSON_GENERATION_MODEL_SCOPE_ID
            ),
          }),
        });
      })
    ),
    Layer.mergeAll(
      Layer.succeed(CourseStore, dependencies.courseStore),
      chatModelProviderLayer
    )
  );

  return Layer.mergeAll(
    Layer.succeed(ChatStore, dependencies.chatStore),
    Layer.succeed(ChatRunStore, dependencies.chatRunStore),
    chatModelProviderLayer,
    lessonGeneratorLayer,
    Layer.succeed(ArtifactPublisher, artifactPublisherContract),
    chatTitleComposerLayer,
    artifactGeneratorLayer,
    Layer.succeed(CourseStore, dependencies.courseStore),
    Layer.succeed(ModelSettingsStore, dependencies.modelSettingsStore)
  );
}

export function createCurioRuntime(
  dependencies: CurioApiDependencies
): CurioRuntime {
  return ManagedRuntime.make(buildCurioLayer(dependencies));
}
