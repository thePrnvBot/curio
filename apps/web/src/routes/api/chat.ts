import { toUIMessage } from "@curio/api/domain/chat";
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
import { createWebTools } from "@curio/api/infrastructure/web-tools";
import { ChatStore } from "@curio/api/services/chat-store";
import { ChatTitleComposer } from "@curio/api/services/chat-title-composer";
import { createFileRoute } from "@tanstack/react-router";
import type { LanguageModel } from "ai";
import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
} from "ai";
import type { ToolUIPart, UIMessage } from "ai";
import { Effect, Option } from "effect";
import { z } from "zod";

import {
  createScopedCourseLesson,
  createScopedCourseScaffold,
  createScopedModel,
  curioFeatures,
  curioRuntime,
  runtimeScopedArtifactPublisher,
} from "../../services";
import { requestSession, unauthorizedResponse } from "../../utils/api-session";
import {
  chatRunInFlight,
  commitChatRunChunks,
  createDurableRun,
  markRunAborted,
  releaseRunRegistration,
  registerRunAbortController,
} from "../../utils/durable-chat";

/**
 * Human-in-the-loop reconstruction: an ask_user call can stay unresolved
 * while the user answers via the question UI. Before the conversation goes
 * back to the model, those parts are given synthetic outputs so the model
 * sees a completed tool step and reads the answers from the next user message.
 */
function sanitizePendingQuestionTools(
  conversation: readonly UIMessage[]
): UIMessage[] {
  function mapPart(part: unknown): unknown {
    if (
      typeof part !== "object" ||
      part === null ||
      (part as ToolUIPart).type !== `tool-${ASK_USER_TOOL_NAME}`
    ) {
      return part;
    }
    const questionPart = part as ToolUIPart;
    if (typeof questionPart.state !== "string") {
      return part;
    }
    if (questionPart.state === "output-available") {
      return part;
    }
    return {
      ...questionPart,
      state: "output-available",
      output: {
        note: "The learner answered these questions; the answers are in the next user message.",
      },
    };
  }

  return conversation.map((message) => {
    if (message.role !== "assistant") {
      return message;
    }
    let mutated = false;
    const sanitizedParts = message.parts.map((part) => {
      const mappedPart = mapPart(part);
      if (mappedPart !== part) {
        mutated = true;
      }
      return mappedPart as never;
    });
    return mutated ? { ...message, parts: sanitizedParts } : message;
  });
}

const CHAT_INSTRUCTIONS =
  "You are Curio, the Director - a learning guide that builds courses with the user. " +
  "Answer clearly and use markdown for structure. " +
  "When the user asks you to build a page, document, design, or any publishable deliverable, " +
  "use the create_artifact tool to publish it. " +
  "Do NOT include the artifact review link or any 'View the artifact' link in your reply text; " +
  "the chat renders the published artifact itself as an interactive card directly below your message. " +
  "When the user wants to learn something or asks you to create a course: first use the ask_user " +
  "tool with at most four multiple-choice questions about their level, goal, and preferred pace; " +
  "the UI collects the answers and they arrive in the next user message. Then create the course in " +
  "two phases. Phase 1 - call create_course with the OUTLINE ONLY: a title, a short description, 3 to 6 " +
  "sections (3 to 6 coherent sidebar themes) and 8 to 12 lessons (8 to 12 lesson titles with kinds " +
  "'video', 'cards', 'animation', 'recap' or 'guided-explanation' mixed sensibly); it returns every " +
  "lesson id. NO lesson content in this call. Phase 2 - call create_lesson once per lesson id, IN " +
  "ORDER, passing that lesson's finished content: video walkthroughs with teaching prose (optional " +
  "videoUrl), card decks for condensed reads, one or two interactive HTML animations across the whole " +
  "course, recaps with 2-4 crafted quiz questions, and guided explanations for the concept or code " +
  "walkthroughs that deserve a narrated, step-by-step reveal (guided explanation steps stay short: a " +
  "two-sentence narration and one focused code excerpt per step). Stream the whole build without " +
  "stopping: immediately after each create_lesson result, call create_lesson again for the next " +
  "lesson - do not write prose between lesson calls, do not ask for confirmation, and do not end your " +
  "turn until every lesson id from the scaffold is filled exactly once. Never skip or reorder lessons. " +
  "Include real teaching content in every " +
  "lesson; never leave lessons empty. When all lessons are filled, confirm to the user that the course " +
  "is ready in the Courses tab. Never invent course creation results: only report courses that the " +
  "create_course tool actually created. " +
  "Use web_search when fresh or external facts matter (releases, versions, prices, news): search first, then " +
  "web_read only the most promising urls started from web_search results, and cite sources as links in your " +
  "answer or lesson prose.";

const MAX_STREAM_STEPS = 40;

/**
 * Keeps the Director streaming the course without pause: once a scaffold
 * exists and lessons are still unfilled, every intermediate step is locked
 * to the `create_lesson` tool (no prose interludes, no early turn ends) so
 * the course page fills live while the model works. Returns undefined to
 * restore normal flow once every lesson is filled (or no course is being
 * built).
 */
function prepareCourseChunkStep({
  stepNumber,
  steps,
}: {
  stepNumber: number;
  steps: Array<{
    readonly toolResults: ReadonlyArray<{ toolName: string; output: unknown }>;
  }>;
}): { activeTools: [string]; toolChoice: "required" } | undefined {
  if (stepNumber === 0) {
    return undefined;
  }
  let scaffoldLessonCount = 0;
  let filledLessonCount = 0;
  for (const step of steps) {
    for (const toolResult of step.toolResults) {
      if (toolResult.toolName === CREATE_COURSE_TOOL_NAME) {
        const scaffoldOutput = toolResult.output as {
          readonly course?: { readonly lessonCount?: number };
        } | null;
        scaffoldLessonCount += scaffoldOutput?.course?.lessonCount ?? 0;
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
    activeTools: [CREATE_LESSON_TOOL_NAME],
    toolChoice: "required",
  };
}

const generateAssistantMessageId = createIdGenerator({
  prefix: "msg",
  size: 16,
});

const chatRequestSchema = z.object({
  id: z.string().min(1).max(64),
  message: z.custom<UIMessage>().optional(),
  messageId: z.string().min(1).max(64).optional(),
  // AI SDK 7 trigger values (v5 renamed submit-user-message → submit-message)
  trigger: z.enum(["submit-message", "regenerate-message"]).optional(),
});

function deriveChatTitle(messages: readonly UIMessage[]): string | null {
  const firstUserMessage = messages.find((message) => message.role === "user");
  if (!firstUserMessage) {
    return null;
  }
  const firstTextPart = firstUserMessage.parts.find(
    (part) => part.type === "text"
  );
  if (firstTextPart?.type !== "text" || firstTextPart.text.trim() === "") {
    return null;
  }
  const rawTitle = firstTextPart.text.trim().replaceAll(/\s+/gu, " ");
  return rawTitle.length <= 64 ? rawTitle : `${rawTitle.slice(0, 61)}...`;
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

async function persistGeneratedMessages({
  chatId,
  chatTitle,
  generatedMessages,
  userId,
}: {
  chatId: string;
  chatTitle: string | null;
  generatedMessages: UIMessage[];
  userId: string;
}): Promise<void> {
  const persistEffect = Effect.gen(function* persist() {
    const chatStore = yield* ChatStore;
    yield* chatStore.replaceMessages(
      { chatId, messages: generatedMessages },
      userId
    );
    if (chatTitle) {
      yield* chatStore.setMessageTitle(chatId, userId, chatTitle);
    }
  });

  try {
    await curioRuntime.runPromise(persistEffect);
  } catch (error: unknown) {
    console.error("Failed to persist chat messages", error);
  }
}

async function persistPartialMessages({
  chatId,
  conversation,
  partialSteps,
  userId,
}: {
  chatId: string;
  conversation: UIMessage[];
  partialSteps: Parameters<
    NonNullable<Parameters<typeof streamText>[0]["onAbort"]>
  >[0]["steps"];
  userId: string;
}): Promise<void> {
  // Persist the user's input no matter what; the in-flight step is never in
  // `partialSteps`, so partial-model output is appended only when present.
  const partialAssistantText = partialSteps
    .flatMap((step) =>
      step.content
        .filter((part) => part.type === "text")
        .map((part) => (part.type === "text" ? part.text : ""))
    )
    .join("")
    .trim();

  const partialMessages: UIMessage[] = [...conversation];
  if (partialAssistantText.length > 0) {
    partialMessages.push({
      id: generateAssistantMessageId(),
      parts: [{ text: partialAssistantText, type: "text" }],
      role: "assistant",
    });
  }

  await persistGeneratedMessages({
    chatId,
    chatTitle:
      conversation.filter((message) => message.role === "user").length === 1 &&
      partialMessages.length === 1
        ? null
        : deriveChatTitle(partialMessages),
    generatedMessages: partialMessages,
    userId,
  });
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
  const userText =
    generatedMessages
      .find((message) => message.role === "user")
      ?.parts.filter((part) => part.type === "text")
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("\n") ?? "";
  const assistantText =
    generatedMessages
      .find((message) => message.role === "assistant")
      ?.parts.filter((part) => part.type === "text")
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("\n") ?? "";

  if (userText.trim() === "" || assistantText.trim() === "") {
    return;
  }

  try {
    const titleResult = await curioRuntime.runPromise(
      Effect.gen(function* composeChatTitle() {
        const titleComposer = yield* ChatTitleComposer;
        return yield* titleComposer.compose({
          assistantText,
          chatId,
          userText,
        });
      })
    );

    await curioRuntime.runPromise(
      Effect.gen(function* applyComposedTitle() {
        const chatStore = yield* ChatStore;
        return yield* chatStore.setMessageTitle(
          chatId,
          userId,
          titleResult.title
        );
      })
    );
  } catch (titleError: unknown) {
    console.error("Failed to compose chat title", titleError);
  }
}

async function createChatResponse({
  chatId,
  chatModel,
  conversation,
  tools,
  userId,
}: {
  chatId: string;
  chatModel: LanguageModel;
  conversation: UIMessage[];
  tools: Parameters<typeof streamText>[0]["tools"];
  userId: string;
}): Promise<Response> {
  // Durable run: storage first. Nothing reaches a viewer before it is
  // committed, and the run keeps going when clients disconnect.
  const runId = await curioRuntime.runPromise(createDurableRun(chatId));
  const runAbortController = new AbortController();
  registerRunAbortController(runId, runAbortController);

  const streamResult = streamText({
    // Aborts come from the stop button via the abort route, not from the
    // HTTP request: the agent keeps working when the chat is closed.
    abortSignal: runAbortController.signal,
    instructions: CHAT_INSTRUCTIONS,
    messages: await convertToModelMessages(conversation),
    model: chatModel,
    // When the stop button aborts the stream, persist the user's message plus
    // any partial text so the saved history matches what the user saw.
    onAbort: ({ steps: partialSteps }) => {
      markRunAborted(runId);
      void persistPartialMessages({
        chatId,
        conversation,
        partialSteps,
        userId,
      });
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
    onEnd: ({ messages: generatedMessages }) => {
      const isFirstExchange =
        conversation.filter((message) => message.role === "user").length === 1;

      persistGeneratedMessages({
        chatId,
        chatTitle: isFirstExchange ? deriveChatTitle(generatedMessages) : null,
        generatedMessages,
        userId,
      });

      if (isFirstExchange) {
        void composeAndPersistChatTitle({
          chatId,
          generatedMessages,
          userId,
        });
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
    commitChatRunChunks({ chunkStream: writerStream, runId }).pipe(
      Effect.ensuring(releaseRunRegistration(runId))
    )
  );

  return createUIMessageStreamResponse({
    stream: responseStream,
  });
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const sessionOption = await requestSession(request);
        if (Option.isNone(sessionOption)) {
          return unauthorizedResponse();
        }
        const session = sessionOption.value;

        const parsedRequestBody = chatRequestSchema.safeParse(
          await request.json()
        );

        if (!parsedRequestBody.success) {
          console.error(
            "Chat request body rejected",
            parsedRequestBody.error.issues
          );
          return Response.json(
            {
              error: "Invalid chat request body",
              issues: parsedRequestBody.error.issues,
            },
            { status: 400 }
          );
        }

        const chatId = parsedRequestBody.data.id;
        const { message, messageId, trigger } = parsedRequestBody.data;
        const userId = session.user.id;
        const resolvedTrigger = trigger ?? "submit-message";

        const history: UIMessage[] = await curioRuntime.runPromise(
          Effect.gen(function* history() {
            const chatStore = yield* ChatStore;
            yield* chatStore.ensureChatForUser(chatId, userId);
            const messageRecords = yield* chatStore.listMessageRecords(
              chatId,
              userId
            );
            return messageRecords.map(toUIMessage);
          })
        );

        const conversation =
          resolvedTrigger === "regenerate-message"
            ? conversationHistorySlice({
                history,
                regeneratedMessageId: messageId ?? null,
              })
            : buildSubmitConversation(history, message);

        if (conversation.length === 0) {
          return Response.json(
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

        const sanitizedConversation =
          sanitizePendingQuestionTools(conversation);

        // The agent must be idle before it is given more work; the UI's send
        // button only submits from an idle Chat, so a 409 is a stale client.
        const runningRun = await curioRuntime.runPromise(
          chatRunInFlight(chatId, userId)
        );
        if (Option.isSome(runningRun)) {
          return Response.json(
            { error: "The agent is still working on this chat" },
            { status: 409 }
          );
        }

        // Commit the submitted state before generating, so a reload or a
        // reconnect mid-run sees the message that started the run.
        const isFirstExchange =
          sanitizedConversation.filter((candidate) => candidate.role === "user")
            .length === 1;
        await persistGeneratedMessages({
          chatId,
          chatTitle: isFirstExchange
            ? deriveChatTitle(sanitizedConversation)
            : null,
          generatedMessages: sanitizedConversation,
          userId,
        });

        return await createChatResponse({
          chatId,
          chatModel: await createScopedModel(userId, chatId),
          conversation: sanitizedConversation,
          tools: {
            ...courseTools,
            ...questionTools,
            ...artifactTools,
            ...webTools,
          },
          userId,
        });
      },
    },
  },
});
