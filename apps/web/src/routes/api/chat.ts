import { toUIMessage } from "@curio/api/domain/chat";
import { createArtifactTool } from "@curio/api/infrastructure/artifact-create-tool";
import { createAskUserTool } from "@curio/api/infrastructure/ask-user-tool";
import { createCourseTool } from "@curio/api/infrastructure/course-create-tool";
import type { LanguageModel } from "ai";
import { ChatStore } from "@curio/api/services/chat-store";
import { ChatTitleComposer } from "@curio/api/services/chat-title-composer";
import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
} from "ai";
import type { ToolUIPart, UIMessage } from "ai";
import { Effect } from "effect";
import { z } from "zod";

import {
  auth,
  createScopedCourse,
  createScopedModel,
  curioFeatures,
  curioRuntime,
  runtimeScopedArtifactPublisher,
} from "../../services";

const ASK_USER_TOOL_NAME = "ask_user";

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
  "the UI collects the answers and they arrive in the next user message. Then use the create_course " +
  "tool to build a complete course page: 3 to 6 sections (sidebar headings, each a coherent theme) " +
  "holding 8 to 12 lessons total, mixing kinds - video walkthroughs with teaching prose, card decks " +
  "for condensed reads, one or two interactive HTML animations, and recaps with 2-4 crafted quiz " +
  "questions. Include real teaching content in every lesson; never leave lessons empty. Tell the " +
  "user their course is ready in the Courses tab. Never invent course creation results: only report " +
  "courses that the create_course tool actually created.";

const MAX_STREAM_STEPS = 8;

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
  abortSignal,
  chatId,
  chatModel,
  conversation,
  tools,
  userId,
}: {
  abortSignal: AbortSignal;
  chatId: string;
  chatModel: LanguageModel;
  conversation: UIMessage[];
  tools: Parameters<typeof streamText>[0]["tools"];
  userId: string;
}): Promise<Response> {
  const streamResult = streamText({
    abortSignal,
    instructions: CHAT_INSTRUCTIONS,
    messages: await convertToModelMessages(conversation),
    model: chatModel,
    // When the stop button aborts the stream, persist the user's message plus
    // any partial text so the saved history matches what the user saw.
    onAbort: ({ steps: partialSteps }) => {
      void persistPartialMessages({
        chatId,
        conversation,
        partialSteps,
        userId,
      });
    },
    stopWhen: isStepCount(MAX_STREAM_STEPS),
    tools,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
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
          conversation.filter((message) => message.role === "user").length ===
          1;

        persistGeneratedMessages({
          chatId,
          chatTitle: isFirstExchange
            ? deriveChatTitle(generatedMessages)
            : null,
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
    }),
  });
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });

        if (!session) {
          return Response.json(
            { error: "Authentication required" },
            { status: 401 }
          );
        }

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

        const courseTools = createCourseTool((creationRequest) =>
          createScopedCourse(userId, creationRequest)
        );
        const questionTools = createAskUserTool();

        const sanitizedConversation =
          sanitizePendingQuestionTools(conversation);

        return await createChatResponse({
          abortSignal: request.signal,
          chatId,
          chatModel: await createScopedModel(userId, chatId),
          conversation: sanitizedConversation,
          tools: { ...courseTools, ...questionTools, ...artifactTools },
          userId,
        });
      },
    },
  },
});
