import { Effect, Layer, ManagedRuntime } from "effect";

import { ArtifactPublishFailed } from "../domain/artifact";
import { createCourseStoreLessonCompletion } from "../infrastructure/course-store-lesson-completion";
import { createCourseStoreLessonGenerator } from "../infrastructure/course-store-lesson-generator";
import { createGenerateTextArtifactGenerator } from "../infrastructure/generate-text-artifact-generator";
import { createGenerateTextChatTitleComposer } from "../infrastructure/generate-text-chat-title-composer";
import { createGenerateTextLessonContent } from "../infrastructure/generate-text-lesson-generator";
import { searchLessonVideosEffect } from "../infrastructure/lesson-video-search";
import { ArtifactGenerator } from "../services/artifact-generator";
import type { ArtifactPublisherContract } from "../services/artifact-publisher";
import { ArtifactPublisher } from "../services/artifact-publisher";
import type { ChatModelProviderContract } from "../services/chat-model-provider";
import { ChatModelProvider } from "../services/chat-model-provider";
import type { ChatRunStoreContract } from "../services/chat-run-store";
import { ChatRunStore } from "../services/chat-run-store";
import type { ChatStoreContract } from "../services/chat-store";
import { ChatStore } from "../services/chat-store";
import { ChatTitleComposer } from "../services/chat-title-composer";
import type { CourseStoreContract } from "../services/course-store";
import { CourseStore } from "../services/course-store";
import { LearningPreferencesStore } from "../services/learning-preferences-store";
import type { LearningPreferencesStoreContract } from "../services/learning-preferences-store";
import { LessonCompletion } from "../services/lesson-completion";
import { LessonGenerator } from "../services/lesson-generator";
import { ModelSettingsStore } from "../services/model-settings-store";
import type { ModelSettingsStoreContract } from "../services/model-settings-store";

const LESSON_GENERATION_MODEL_SCOPE_ID = "lesson-generation";
const ARTIFACT_MODEL_SCOPE_ID = "artifact-generation";
const TITLE_MODEL_SCOPE_ID = "chat-title";

export type CurioRuntime = ManagedRuntime.ManagedRuntime<
  | ChatStore
  | ChatRunStore
  | ChatModelProvider
  | LessonGenerator
  | LessonCompletion
  | ArtifactPublisher
  | ChatTitleComposer
  | ArtifactGenerator
  | CourseStore
  | LearningPreferencesStore
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

export interface CurioApiDependencies {
  readonly artifactPublisher: ArtifactPublisherContract | null;
  readonly chatModelProvider: ChatModelProviderContract;
  readonly chatRunStore: ChatRunStoreContract;
  readonly chatStore: ChatStoreContract;
  readonly courseStore: CourseStoreContract;
  readonly learningPreferencesStore: LearningPreferencesStoreContract;
  readonly modelSettingsStore: ModelSettingsStoreContract;
}

function buildCurioLayer(dependencies: CurioApiDependencies) {
  const artifactPublisherContract: ArtifactPublisherContract =
    dependencies.artifactPublisher ?? unavailableArtifactPublisherContract;

  const chatModelProviderLayer = Layer.succeed(
    ChatModelProvider,
    dependencies.chatModelProvider
  );
  const courseStoreLayer = Layer.succeed(CourseStore, dependencies.courseStore);

  const chatTitleComposerLayer = Layer.provide(
    Layer.effect(
      ChatTitleComposer,
      Effect.gen(function* makeTitleComposer() {
        const modelProvider = yield* ChatModelProvider;
        return createGenerateTextChatTitleComposer({
          // One composed effect per title generation; reusable and scoped to
          // the title-generation conversation id.
          resolveChatModel: modelProvider.getChatModel(TITLE_MODEL_SCOPE_ID),
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
          resolveChatModel: modelProvider.getChatModel(ARTIFACT_MODEL_SCOPE_ID),
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
        const modelProvider = yield* ChatModelProvider;
        return createCourseStoreLessonGenerator({
          courseStore,
          generateLessonContent: createGenerateTextLessonContent({
            findVerifiedVideo: (query) =>
              searchLessonVideosEffect(query).pipe(
                Effect.map((videos) => videos[0] ?? null)
              ),
            resolveChatModel: modelProvider.getChatModel(
              LESSON_GENERATION_MODEL_SCOPE_ID
            ),
          }),
        });
      })
    ),
    Layer.mergeAll(courseStoreLayer, chatModelProviderLayer)
  );

  const lessonCompletionLayer = Layer.provide(
    Layer.effect(
      LessonCompletion,
      Effect.gen(function* makeLessonCompletion() {
        const courseStore = yield* CourseStore;
        return createCourseStoreLessonCompletion({ courseStore });
      })
    ),
    courseStoreLayer
  );

  return Layer.mergeAll(
    Layer.succeed(ChatStore, dependencies.chatStore),
    Layer.succeed(ChatRunStore, dependencies.chatRunStore),
    chatModelProviderLayer,
    chatTitleComposerLayer,
    artifactGeneratorLayer,
    lessonGeneratorLayer,
    lessonCompletionLayer,
    Layer.succeed(ArtifactPublisher, artifactPublisherContract),
    courseStoreLayer,
    Layer.succeed(
      LearningPreferencesStore,
      dependencies.learningPreferencesStore
    ),
    Layer.succeed(ModelSettingsStore, dependencies.modelSettingsStore)
  );
}

export function createCurioRuntime(
  dependencies: CurioApiDependencies
): CurioRuntime {
  return ManagedRuntime.make(buildCurioLayer(dependencies));
}
