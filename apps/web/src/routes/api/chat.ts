import { toUIMessage } from "@curio/api/domain/chat";
import { ModelCredentialRequired } from "@curio/api/domain/model-settings";
import { createArtifactTool } from "@curio/api/infrastructure/artifact-create-tool";
import {
  ASK_USER_TOOL_NAME,
  createAskUserTool,
} from "@curio/api/infrastructure/ask-user-tool";
import {
  CREATE_COURSE_TOOL_NAME,
  CREATE_LESSON_TOOL_NAME,
  createCourseTool,
} from "@curio/api/infrastructure/course-create-tool";
import { createRabbitHoleTool } from "@curio/api/infrastructure/rabbit-hole/start-tool";
import {
  FIND_VIDEO_TOOL_NAME,
  VERIFY_VIDEO_TOOL_NAME,
  createVideoTools,
} from "@curio/api/infrastructure/video-tools";
import {
  WEB_READ_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  createWebTools,
} from "@curio/api/infrastructure/web-tools";
import { ChatRunStore } from "@curio/api/services/chat-run-store";
import { ChatStore } from "@curio/api/services/chat-store";
import { ChatTitleComposer } from "@curio/api/services/chat-title-composer";
import { createFileRoute } from "@tanstack/react-router";
import type { LanguageModel, ModelMessage, UIMessage, ToolUIPart } from "ai";
import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  isStepCount,
  isToolUIPart,
  streamText,
  toUIMessageStream,
  validateUIMessages,
} from "ai";
import { Effect, Option } from "effect";
import { z } from "zod";

import {
  createScopedCourseLesson,
  createScopedCourseScaffold,
  createScopedModel,
  curioFeatures,
  curioRuntime,
  getScopedLearningInstructions,
  runtimeScopedArtifactPublisher,
} from "../../services";
import { requestSession, unauthorizedResponse } from "../../utils/api-session";
import { isSupportedChatAttachment } from "../../utils/chat-attachments";
import { toCourseCreatedData } from "../../utils/chat-schemas";
import {
  createDurableRun,
  commitChatRunChunks,
  markRunAborted,
  recoverStaleChatRun,
  registerRunAbortController,
  releaseRunRegistration,
} from "../../utils/durable-chat";
import { logger } from "../../utils/logger";
import { checkRateLimit, rateLimitResponse } from "../../utils/rate-limit";
import { withSecurityHeaders } from "../../utils/security-headers";
import { buildChatInstructions } from "./-chat-instructions";

/**
 * Human-in-the-loop reconstruction: an ask_user call can stay unresolved
 * while the user answers via the question UI. Before the conversation goes
 * back to the model, those parts are given synthetic outputs so the model
 * sees a completed tool step and reads the answers from the next user message.
 */
function sanitizePendingQuestionTools(
  conversation: readonly UIMessage[]
): UIMessage[] {
  const pendingAnswerNote =
    "The learner answered these questions; the answers are in the next user message.";

  function sanitizePart(
    part: UIMessage["parts"][number]
  ): UIMessage["parts"][number] {
    if (!isToolUIPart(part)) {
      return part;
    }
    if (part.type !== `tool-${ASK_USER_TOOL_NAME}`) {
      return part;
    }
    if (part.state === "output-available") {
      return part;
    }
    // Rebuilding a tool part across the SDK's state union requires one
    // boundary cast: the states are unrelated shapes (an input-streaming
    // part has no output slot to fill), so no plain spread can satisfy the
    // union. The result is structurally a valid completed tool part.
    return {
      ...part,
      state: "output-available",
      output: { note: pendingAnswerNote },
    } as ToolUIPart;
  }

  return conversation.map((message) => {
    if (message.role !== "assistant") {
      return message;
    }
    const sanitizedParts = message.parts.map(sanitizePart);
    const mutated = message.parts.some(
      (originalPart, partIndex) => sanitizedParts[partIndex] !== originalPart
    );
    return mutated ? { ...message, parts: sanitizedParts } : message;
  });
}

const MAX_STREAM_STEPS = 60;

/**
 * Tools the Director may call while it is still filling a course. Video
 * lessons need research BEFORE their create_lesson call, so the step lock has
 * to keep the video + web tools reachable instead of forcing create_lesson
 * every single step.
 */
const COURSE_CHUNK_SIDE_TOOLS: readonly string[] = [
  FIND_VIDEO_TOOL_NAME,
  VERIFY_VIDEO_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WEB_READ_TOOL_NAME,
];

/** One completed tool result inside a generation step (pre-decode). */
interface CourseChunkToolResult {
  readonly toolName: string;
  readonly output: unknown;
}

/** A completed generation step, as the step provider observes it. */
interface CourseChunkStep {
  readonly toolResults: readonly CourseChunkToolResult[];
}

/**
 * Keeps the Director streaming the course without pause: once a scaffold
 * exists and lessons are still unfilled, every intermediate step is locked to
 * the lesson tools (no prose interludes, no early turn ends) so the course page
 * fills live while the model works. Video research stays available so each
 * video lesson can be verified before it is written. Returns undefined to
 * restore normal flow once every lesson is filled (or no course is being
 * built).
 */
function prepareCourseChunkStep({
  stepNumber,
  steps,
}: {
  stepNumber: number;
  steps: readonly CourseChunkStep[];
}): { activeTools: string[]; toolChoice: "required" } | undefined {
  if (stepNumber === 0) {
    return undefined;
  }
  let scaffoldLessonCount = 0;
  let filledLessonCount = 0;
  for (const step of steps) {
    for (const toolResult of step.toolResults) {
      if (toolResult.toolName === CREATE_COURSE_TOOL_NAME) {
        // The scaffold shape is the same untrusted payload the chat renders;
        // decode it once instead of trusting an ad-hoc cast on the server.
        scaffoldLessonCount += Option.match(
          toCourseCreatedData(toolResult.output),
          {
            onNone: () => 0,
            onSome: (scaffold) => scaffold.lessonCount,
          }
        );
      }
      if (toolResult.toolName === CREATE_LESSON_TOOL_NAME) {
        filledLessonCount += 1;
      }
    }
  }
  if (scaffoldLessonCount === 0 || filledLessonCount >= scaffoldLessonCount) {
    return undefined;
  }
  return {
    activeTools: [CREATE_LESSON_TOOL_NAME, ...COURSE_CHUNK_SIDE_TOOLS],
    toolChoice: "required",
  };
}

const generateAssistantMessageId = createIdGenerator({
  prefix: "msg",
  size: 16,
});

function secureJson(body: unknown, init?: ResponseInit): Response {
  return withSecurityHeaders(Response.json(body, init));
}

const chatRequestSchema = z.object({
  id: z.string().min(1).max(64),
  // Validated separately through `validateUIMessages`; this only proves the
  // field is present.
  message: z.unknown().optional(),
  messageId: z.string().min(1).max(64).optional(),
  // AI SDK 7 trigger values (v5 renamed submit-user-message → submit-message)
  trigger: z.enum(["submit-message", "regenerate-message"]).optional(),
});

const CHAT_TITLE_MAX_LENGTH = 64;
const CHAT_TITLE_SUFFIX = "...";

function deriveChatTitle(
  messages: readonly UIMessage[]
): Option.Option<string> {
  const firstUserMessage = messages.find((message) => message.role === "user");
  if (firstUserMessage === undefined) {
    return Option.none();
  }
  const firstTextPart = firstUserMessage.parts.find(
    (part) => part.type === "text"
  );
  if (firstTextPart?.type !== "text" || firstTextPart.text.trim() === "") {
    return Option.none();
  }
  const normalizedTitle = firstTextPart.text.trim().replaceAll(/\s+/gu, " ");
  return Option.some(
    normalizedTitle.length <= CHAT_TITLE_MAX_LENGTH
      ? normalizedTitle
      : `${normalizedTitle.slice(0, CHAT_TITLE_MAX_LENGTH - CHAT_TITLE_SUFFIX.length)}${CHAT_TITLE_SUFFIX}`
  );
}

function buildSubmitConversation(
  history: readonly UIMessage[],
  submittedMessage: UIMessage | undefined
): UIMessage[] {
  if (!submittedMessage) {
    return [...history];
  }
  return [...history, submittedMessage];
}

function conversationHistorySlice({
  history,
  regeneratedMessageId,
}: {
  history: readonly UIMessage[];
  regeneratedMessageId: string | null;
}): UIMessage[] {
  if (!regeneratedMessageId) {
    return [...history];
  }
  const regeneratedIndex = history.findIndex(
    (message) => message.id === regeneratedMessageId
  );
  if (regeneratedIndex === -1) {
    return [...history];
  }
  // Regenerate reruns the assistant message, so keep only what came before it
  return history.slice(0, regeneratedIndex);
}

function collectText(parts: readonly UIMessage["parts"][number][]): string {
  return parts
    .filter(
      (part): part is Extract<typeof part, { type: "text" }> =>
        part.type === "text"
    )
    .map((part) => part.text)
    .join("\n");
}

async function persistGeneratedMessages({
  chatId,
  chatTitle,
  generatedMessages,
  userId,
}: {
  chatId: string;
  chatTitle: Option.Option<string>;
  generatedMessages: UIMessage[];
  userId: string;
}): Promise<void> {
  const persistEffect = Effect.gen(function* persist() {
    const chatStore = yield* ChatStore;
    yield* chatStore.replaceMessages(
      { chatId, messages: generatedMessages },
      userId
    );
    if (Option.isSome(chatTitle)) {
      yield* chatStore.setMessageTitle(chatId, userId, chatTitle.value);
    }
  });

  await curioRuntime.runPromise(persistEffect);
}

async function composeAndPersistChatTitle({
  chatId,
  generatedMessages,
  userId,
}: {
  chatId: string;
  generatedMessages: UIMessage[];
  userId: string;
}): Promise<void> {
  const firstMessageWithRole = (role: UIMessage["role"]) =>
    generatedMessages.find((message) => message.role === role);
  const firstUserMessage = firstMessageWithRole("user");
  const firstAssistantMessage = firstMessageWithRole("assistant");
  if (firstUserMessage === undefined || firstAssistantMessage === undefined) {
    return;
  }
  const userText = collectText(firstUserMessage.parts);
  const assistantText = collectText(firstAssistantMessage.parts);

  if (userText.trim() === "" || assistantText.trim() === "") {
    return;
  }

  try {
    await curioRuntime.runPromise(
      Effect.gen(function* composeAndApplyTitle() {
        const titleComposer = yield* ChatTitleComposer;
        const titleResult = yield* titleComposer.compose({
          assistantText,
          chatId,
          userText,
        });
        const chatStore = yield* ChatStore;
        yield* chatStore.setMessageTitle(chatId, userId, titleResult.title);
      }).pipe(Effect.timeout("5 seconds"))
    );
  } catch (titleError: unknown) {
    // The derived title is already persisted; a slow/failed composer is an
    // enhancement loss, never a reason to fail the answer.
    logger.warn("Failed to compose chat title", titleError);
  }
}

async function createChatResponse({
  chatId,
  chatModel,
  conversation,
  customInstructions,
  modelMessages,
  runId,
  tools,
  userId,
}: {
  chatId: string;
  chatModel: LanguageModel;
  conversation: UIMessage[];
  customInstructions: string | null;
  modelMessages: ModelMessage[];
  runId: string;
  tools: Parameters<typeof streamText>[0]["tools"];
  userId: string;
}): Promise<Response> {
  const runAbortController = new AbortController();
  registerRunAbortController(runId, runAbortController);

  // `onEnd` persists the final transcript before the stream closes; the
  // committed-chunk writer reads this probe so the run is only `done` when
  // the transcript is durable.
  let persistenceFailure: unknown = null;

  try {
    const streamResult = streamText({
      // Aborts come from the stop button via the abort route, not from the
      // HTTP request: the agent keeps working when the chat is closed.
      abortSignal: runAbortController.signal,
      instructions: buildChatInstructions(customInstructions),
      messages: modelMessages,
      model: chatModel,
      // When the stop button aborts the stream, mark the run here. The
      // committed-chunk writer persists the in-flight text before it settles
      // the run; `onEnd` skips its full-transcript write for aborted runs.
      onAbort: () => {
        markRunAborted(runId);
      },
      stopWhen: isStepCount(MAX_STREAM_STEPS),
      prepareStep: prepareCourseChunkStep,
      tools,
    });

    const uiStream = toUIMessageStream({
      generateMessageId: generateAssistantMessageId,
      onError: (streamError) => {
        if (typeof streamError === "string") {
          return streamError;
        }
        return streamError instanceof Error
          ? streamError.message
          : JSON.stringify(streamError);
      },
      onEnd: async ({ isAborted, messages: generatedMessages }) => {
        // The committed-chunk writer persists the stopped run's partial
        // transcript; writing again here would race that snapshot.
        if (isAborted) {
          return;
        }
        const isFirstExchange =
          conversation.filter((message) => message.role === "user").length ===
          1;

        try {
          await persistGeneratedMessages({
            chatId,
            chatTitle: isFirstExchange
              ? deriveChatTitle(generatedMessages)
              : Option.none(),
            generatedMessages,
            userId,
          });
          if (isFirstExchange) {
            await composeAndPersistChatTitle({
              chatId,
              generatedMessages,
              userId,
            });
          }
        } catch (error: unknown) {
          persistenceFailure = error;
          logger.error("Failed to persist chat messages", error);
        }
      },
      originalMessages: conversation,
      stream: streamResult.stream,
    });

    // One branch commits the stream to storage as a supervised background
    // fiber (the durable transcript the resume endpoint replays); the other
    // answers the submitting client live. Cancelling either branch never
    // interrupts the other, or the generation itself.
    const [writerStream, responseStream] = uiStream.tee();
    curioRuntime.runFork(
      commitChatRunChunks({
        chatId,
        chunkStream: writerStream,
        hasPersistenceFailure: () => persistenceFailure !== null,
        runId,
        userId,
      }).pipe(Effect.ensuring(releaseRunRegistration(runId)))
    );

    return createUIMessageStreamResponse({
      stream: responseStream,
    });
  } catch (error: unknown) {
    releaseRunRegistration(runId);
    await curioRuntime
      .runPromise(
        Effect.gen(function* failRun() {
          const chatRunStore = yield* ChatRunStore;
          yield* chatRunStore.finishRun(runId, "error");
        })
      )
      .catch(() => null);
    logger.error("Failed to start chat stream", error);
    return secureJson(
      { error: "Failed to start the agent run" },
      { status: 502 }
    );
  }
}

type SubmittedMessageResolution =
  | { readonly ok: true; readonly message: UIMessage | undefined }
  | { readonly ok: false; readonly response: Response };

/**
 * Validates the untrusted submitted message through the SDK. Regenerate
 * requests do not append it, so their trailing assistant part (possibly an
 * artifact/tool part) is not re-validated.
 */
async function resolveSubmittedMessage({
  rawMessage,
  trigger,
}: {
  rawMessage: unknown;
  trigger: "submit-message" | "regenerate-message";
}): Promise<SubmittedMessageResolution> {
  if (trigger === "regenerate-message") {
    return { message: undefined, ok: true };
  }
  if (rawMessage === undefined) {
    return {
      ok: false,
      response: secureJson(
        { error: "A submitted message is required" },
        { status: 400 }
      ),
    };
  }
  try {
    const validatedMessages = await validateUIMessages({
      messages: [rawMessage],
    });
    const validatedMessage = validatedMessages.at(0);
    if (validatedMessage === undefined) {
      return {
        ok: false,
        response: secureJson(
          { error: "Invalid chat message" },
          { status: 400 }
        ),
      };
    }
    const unsupportedAttachment = validatedMessage.parts.some(
      (part) =>
        part.type === "file" && !isSupportedChatAttachment(part.mediaType)
    );
    if (unsupportedAttachment) {
      return {
        ok: false,
        response: secureJson(
          { error: "Unsupported chat attachment type" },
          { status: 400 }
        ),
      };
    }
    return { message: validatedMessage, ok: true };
  } catch {
    return {
      ok: false,
      response: secureJson({ error: "Invalid chat message" }, { status: 400 }),
    };
  }
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const sessionOption = await requestSession(request);
        if (Option.isNone(sessionOption)) {
          return withSecurityHeaders(unauthorizedResponse());
        }
        const session = sessionOption.value;

        const rateLimit = checkRateLimit(`chat:${session.user.id}`, {
          limit: 30,
          windowMs: 60_000,
        });
        if (!rateLimit.allowed) {
          return withSecurityHeaders(rateLimitResponse(rateLimit.headers));
        }

        let requestBody: unknown;
        try {
          requestBody = await request.json();
        } catch {
          return secureJson(
            { error: "Invalid chat request body" },
            { status: 400 }
          );
        }

        const parsedRequestBody = chatRequestSchema.safeParse(requestBody);

        if (!parsedRequestBody.success) {
          logger.error("Chat request body rejected", parsedRequestBody.error);
          return secureJson(
            {
              error: "Invalid chat request body",
              issues: parsedRequestBody.error.issues,
            },
            { status: 400 }
          );
        }

        const chatId = parsedRequestBody.data.id;
        const {
          message: rawMessage,
          messageId,
          trigger,
        } = parsedRequestBody.data;
        const userId = session.user.id;
        const resolvedTrigger = trigger ?? "submit-message";

        const messageResolution = await resolveSubmittedMessage({
          rawMessage,
          trigger: resolvedTrigger,
        });
        if (!messageResolution.ok) {
          return messageResolution.response;
        }
        const { message } = messageResolution;

        const historyOutcome = await curioRuntime.runPromise(
          Effect.result(
            Effect.gen(function* history() {
              const chatStore = yield* ChatStore;
              yield* chatStore.ensureChatForUser(chatId, userId);
              // Recover before reading history: a crashed run's committed
              // partial must be part of the transcript and model context,
              // otherwise the submit rewrites it away.
              yield* recoverStaleChatRun(chatId, userId);
              const messageRecords = yield* chatStore.listMessageRecords(
                chatId,
                userId
              );
              return messageRecords.map(toUIMessage);
            })
          )
        );
        if (historyOutcome._tag === "Failure") {
          if (historyOutcome.failure._tag === "ChatNotFound") {
            return secureJson({ error: "Chat not found" }, { status: 404 });
          }
          logger.error("Failed to load chat history", historyOutcome.failure);
          return secureJson(
            { error: "Failed to load the chat" },
            { status: 500 }
          );
        }
        const history: UIMessage[] = historyOutcome.success;

        const conversation =
          resolvedTrigger === "regenerate-message"
            ? conversationHistorySlice({
                history,
                regeneratedMessageId: messageId ?? null,
              })
            : buildSubmitConversation(history, message);

        if (conversation.length === 0) {
          return secureJson(
            { error: "Chat request produced an empty conversation" },
            { status: 400 }
          );
        }

        const artifactTools = curioFeatures.artifactPublishingEnabled
          ? createArtifactTool(runtimeScopedArtifactPublisher)
          : undefined;

        const courseTools = createCourseTool({
          createScopedCourseLesson: (lessonRequest) =>
            createScopedCourseLesson(userId, lessonRequest),
          createScopedCourseScaffold: (planRequest) =>
            createScopedCourseScaffold(userId, planRequest),
        });
        const questionTools = createAskUserTool();
        const webTools = createWebTools();
        const videoTools = createVideoTools();
        const rabbitHoleTools = createRabbitHoleTool({ chatId, userId });

        const sanitizedConversation =
          sanitizePendingQuestionTools(conversation);

        // Convert before claiming the run: a conversion failure must not
        // leave a `running` row blocking the chat.
        const modelMessages = await convertToModelMessages(
          sanitizedConversation
        );

        // Atomic admission: the database refuses a second running run, so
        // two tabs or a double submit cannot both start generation.
        const runAdmission = await curioRuntime.runPromise(
          Effect.result(createDurableRun(chatId, userId))
        );
        if (runAdmission._tag === "Failure") {
          if (runAdmission.failure._tag === "ChatRunInFlight") {
            return secureJson(
              { error: "The agent is still working on this chat" },
              { status: 409 }
            );
          }
          logger.error("Failed to admit chat run", runAdmission.failure);
          return secureJson(
            { error: "Failed to start the agent run" },
            { status: 500 }
          );
        }
        const runId = runAdmission.success;

        // Commit the submitted state before generating, so a reload or a
        // reconnect mid-run sees the message that started the run.
        const isFirstExchange =
          sanitizedConversation.filter((candidate) => candidate.role === "user")
            .length === 1;
        try {
          await persistGeneratedMessages({
            chatId,
            chatTitle: isFirstExchange
              ? deriveChatTitle(sanitizedConversation)
              : Option.none(),
            generatedMessages: sanitizedConversation,
            userId,
          });
        } catch (persistError: unknown) {
          logger.error(
            "Failed to persist the submitted chat messages",
            persistError
          );
          await curioRuntime
            .runPromise(
              Effect.gen(function* failRun() {
                const chatRunStore = yield* ChatRunStore;
                yield* chatRunStore.finishRun(runId, "error");
              })
            )
            .catch(() => null);
          return secureJson(
            { error: "Failed to save the chat message" },
            { status: 500 }
          );
        }

        let chatModel: LanguageModel;
        let customInstructions: string | null = null;
        try {
          [chatModel, customInstructions] = await Promise.all([
            createScopedModel(userId, chatId),
            getScopedLearningInstructions(userId),
          ]);
        } catch (modelError: unknown) {
          const credentialMissing =
            modelError instanceof ModelCredentialRequired;
          if (credentialMissing) {
            // Misconfiguration, not a server defect: the user must supply the
            // key for their custom endpoint. Never retry against that host.
            logger.warn(
              "Chat model is missing a user credential",
              modelError.message
            );
          } else {
            logger.error("Failed to resolve the chat model", modelError);
          }
          await curioRuntime
            .runPromise(
              Effect.gen(function* failRun() {
                const chatRunStore = yield* ChatRunStore;
                yield* chatRunStore.finishRun(runId, "error");
              })
            )
            .catch(() => null);
          if (credentialMissing) {
            return secureJson({ error: modelError.message }, { status: 400 });
          }
          return secureJson(
            { error: "Failed to resolve the chat model" },
            { status: 500 }
          );
        }

        return await createChatResponse({
          chatId,
          chatModel,
          conversation: sanitizedConversation,
          customInstructions,
          modelMessages,
          runId,
          tools: {
            ...courseTools,
            ...questionTools,
            ...artifactTools,
            ...webTools,
            ...videoTools,
            ...rabbitHoleTools,
          },
          userId,
        });
      },
    },
  },
});
