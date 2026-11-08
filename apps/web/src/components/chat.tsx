import { useChat } from "@ai-sdk/react";
import {
  CREATE_COURSE_TOOL_NAME,
  CREATE_LESSON_TOOL_NAME,
} from "@curio/api/infrastructure/course-create-tool";
import type { ChatAttachmentData } from "@curio/ui/components/ai-elements/attachments";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@curio/ui/components/ai-elements/conversation";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@curio/ui/components/ai-elements/message";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@curio/ui/components/ai-elements/prompt-input";
import type { PromptInputMessage } from "@curio/ui/components/ai-elements/prompt-input";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@curio/ui/components/ai-elements/reasoning";
import {
  Suggestion,
  Suggestions,
} from "@curio/ui/components/ai-elements/suggestion";
import { useQueryClient } from "@tanstack/react-query";
import { isToolUIPart } from "ai";
import type { UIMessage } from "ai";
import { Option } from "effect";
import {
  CopyIcon,
  PanelRightIcon,
  RefreshCwIcon,
  SparklesIcon,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import ChatSessionPanel from "@/components/chat-session-panel";
import { ArtifactActionButton } from "@/components/chat/chat-artifact-button";
import { ArtifactInlineView } from "@/components/chat/chat-artifact-card";
import { ArtifactToolView } from "@/components/chat/chat-artifact-tool-card";
import { InlineFilePartView } from "@/components/chat/chat-file-media";
import { PromptInputAttachmentsDisplay } from "@/components/chat/chat-input-attachments";
import {
  ChatSkeleton,
  CourseCreatedNote,
  LessonChunkNote,
} from "@/components/chat/chat-notes";
import {
  extractPendingQuestions,
  PendingQuestionsPanel,
} from "@/components/chat/chat-questions";
import { WebToolView } from "@/components/chat/chat-web-tools";
import {
  CHAT_ATTACHMENT_ACCEPT,
  describeUnsupportedAttachment,
  isSupportedChatAttachment,
  MAX_CHAT_ATTACHMENT_BYTES,
} from "@/utils/chat-attachments";
import {
  clearChatStopped,
  getChatInstance,
  markChatIdle,
  markChatStopped,
  markChatStreaming,
  titleFromMessages,
} from "@/utils/chat-runtime";
import {
  toArtifactData,
  toCourseCreatedData,
  toLessonChunkData,
} from "@/utils/chat-schemas";
import { logger } from "@/utils/logger";
import { playInteractionCue } from "@/utils/sound";
import { useTRPC } from "@/utils/trpc";
import type { ArtifactUIData } from "@/utils/ui-messages";
import { restoreUIMessages } from "@/utils/ui-messages";

export { ChatSkeleton } from "@/components/chat/chat-notes";

export interface PersistedChatMessageRecord {
  readonly id: string;
  readonly role: string;
  readonly parts: unknown;
}

const TOOL_WEB_SEARCH = "tool-web_search";
const TOOL_WEB_READ = "tool-web_read";

const CHAT_STARTER_SUGGESTIONS = [
  "Build a landing page artifact and publish it for review",
  "Write a project postmortem as a markdown artifact",
  "Design an SVG logo and publish it for review",
  "Compare optimistic vs pessimistic locking in databases",
] as const;

type RestoredMessagesState =
  | { readonly status: "restoring" }
  | { readonly status: "ready"; readonly messages: UIMessage[] };

function useRestoredMessages(
  persistedMessages: readonly PersistedChatMessageRecord[] | undefined
): RestoredMessagesState {
  const hasPersistedMessages =
    persistedMessages !== undefined && persistedMessages.length > 0;

  const [state, setState] = useState<RestoredMessagesState>(
    hasPersistedMessages
      ? { status: "restoring" }
      : { status: "ready", messages: [] }
  );

  useEffect(() => {
    if (!hasPersistedMessages) {
      return;
    }
    let cancelled = false;

    async function restorePersistedMessages(): Promise<void> {
      try {
        const messages = await restoreUIMessages(persistedMessages ?? []);
        if (!cancelled) {
          setState({ status: "ready", messages });
        }
      } catch (error: unknown) {
        logger.error("Failed to restore chat messages", error);
        if (!cancelled) {
          toast.error("Couldn't load chat history");
          setState({ status: "ready", messages: [] });
        }
      }
    }

    restorePersistedMessages();

    return () => {
      cancelled = true;
    };
  }, [hasPersistedMessages, persistedMessages]);

  return state;
}

type MessagePart = UIMessage["parts"][number];

function renderInlinePart(
  part: MessagePart,
  partIndex: number,
  isStreaming: boolean
): ReactNode {
  if (part.type === "text") {
    return part.text.length > 0 ? (
      <MessageResponse key={partIndex}>{part.text}</MessageResponse>
    ) : null;
  }

  if (part.type === "reasoning") {
    // No thought traces yet (either not streamed or the model emits none) —
    // don't render the thinking dropdown.
    if (part.text.trim().length === 0) {
      return null;
    }
    return (
      <Reasoning
        defaultOpen={false}
        // Aborts and errors leave the in-flight part at "streaming"; the
        // global status tells us the stream is truly over.
        isStreaming={part.state === "streaming" && isStreaming}
        key={partIndex}
      >
        <ReasoningTrigger />
        <ReasoningContent>{part.text}</ReasoningContent>
      </Reasoning>
    );
  }

  return null;
}

/** Parts that need full message width (tool cards, artifacts, files). */
function isStructuralPart(part: MessagePart): boolean {
  return (
    part.type === "data-artifact" || part.type === "file" || isToolUIPart(part)
  );
}

function renderStructuralPart(part: MessagePart, partIndex: number): ReactNode {
  const structuralKey = `artifact-structural-${partIndex}`;

  if (part.type === "data-artifact") {
    const inlineArtifactData = toArtifactData(part.data);
    if (Option.isNone(inlineArtifactData)) {
      return null;
    }
    return (
      <ArtifactInlineView data={inlineArtifactData.value} key={structuralKey} />
    );
  }

  if (part.type === "file") {
    const fileEntry: ChatAttachmentData = {
      filename: part.filename,
      id: `file-${partIndex}`,
      mediaType: part.mediaType,
      url: part.url,
    };

    return <InlineFilePartView fileEntry={fileEntry} key={structuralKey} />;
  }

  if (!isToolUIPart(part)) {
    return null;
  }

  if (part.type === `tool-${CREATE_COURSE_TOOL_NAME}`) {
    if (part.state !== "output-available") {
      return null;
    }
    const createdCourseData = toCourseCreatedData(part.output);
    if (Option.isNone(createdCourseData)) {
      return null;
    }
    return (
      <div className="w-full" key={structuralKey}>
        <CourseCreatedNote courseData={createdCourseData.value} />
      </div>
    );
  }
  if (part.type === `tool-${CREATE_LESSON_TOOL_NAME}`) {
    // Streaming chunk progress: each filled lesson is its own tiny note
    // while the course builds up.
    if (part.state !== "output-available") {
      return null;
    }
    const lessonChunkData = toLessonChunkData(part.output);
    if (Option.isNone(lessonChunkData)) {
      return null;
    }
    return (
      <div className="w-full" key={structuralKey}>
        <LessonChunkNote
          position={lessonChunkData.value.position}
          title={lessonChunkData.value.title}
        />
      </div>
    );
  }
  if (part.type === TOOL_WEB_SEARCH || part.type === TOOL_WEB_READ) {
    // Web tool calls render as collapsible cards, live: running while the
    // Director searches, completed once committed.
    return <WebToolView key={structuralKey} part={part} />;
  }
  if (part.type !== "tool-create_artifact") {
    return null;
  }
  // The artifact content is always rendered in the chat when the publish
  // succeeded; the tool card below is just run info.
  const publishedArtifactData =
    part.state === "output-available"
      ? toArtifactData(part.input)
      : Option.none<ArtifactUIData>();

  return (
    <div className="w-full space-y-2" key={structuralKey}>
      <ArtifactToolView
        hideArtifact={Option.isSome(publishedArtifactData)}
        part={part}
      />
      {Option.isSome(publishedArtifactData) && (
        <ArtifactInlineView data={publishedArtifactData.value} />
      )}
    </div>
  );
}

/**
 * User parts stay on the user's side: text in the secondary bubble and file
 * attachments right-aligned below it. They never render through the
 * structural (assistant/tool) path.
 */
export function renderUserMessageParts(
  message: UIMessage
): readonly ReactNode[] {
  const rendered: ReactNode[] = [];
  const hasFileParts = message.parts.some((part) => part.type === "file");
  for (const [partIndex, part] of message.parts.entries()) {
    if (part.type === "text" && part.text.length > 0) {
      // Hide the old attachments-only placeholder written by earlier builds.
      if (
        hasFileParts &&
        part.text.trim().toLowerCase() === "sent with attachments"
      ) {
        continue;
      }
      rendered.push(
        <MessageContent key={`user-text-${partIndex}`}>
          <MessageResponse>{part.text}</MessageResponse>
        </MessageContent>
      );
      continue;
    }
    if (part.type === "file") {
      const fileEntry: ChatAttachmentData = {
        filename: part.filename,
        id: `user-file-${partIndex}`,
        mediaType: part.mediaType,
        url: part.url,
      };
      rendered.push(
        <div
          className="ml-auto w-fit max-w-full"
          key={`user-file-${partIndex}`}
        >
          <InlineFilePartView fileEntry={fileEntry} />
        </div>
      );
    }
  }
  return rendered;
}

/**
 * Renders message parts in their original order. Consecutive text/reasoning
 * parts share one `MessageContent` block; tool, artifact and file parts break
 * out to full width. This keeps an answer that follows a tool call *below*
 * the tool card instead of hoisting every text block above it.
 */
function renderMessageParts(
  message: UIMessage,
  isStreaming: boolean
): readonly ReactNode[] {
  if (message.role === "user") {
    return renderUserMessageParts(message);
  }

  const rendered: ReactNode[] = [];
  let inlineNodes: ReactNode[] = [];
  let inlineStart: number | null = null;

  const flushInlineNodes = (): void => {
    if (inlineNodes.length === 0) {
      return;
    }
    rendered.push(
      <MessageContent key={`inline-${inlineStart ?? 0}`}>
        {inlineNodes}
      </MessageContent>
    );
    inlineNodes = [];
    inlineStart = null;
  };

  for (const [partIndex, part] of message.parts.entries()) {
    if (isStructuralPart(part)) {
      flushInlineNodes();
      const structuralNode = renderStructuralPart(part, partIndex);
      if (structuralNode !== null && structuralNode !== undefined) {
        rendered.push(structuralNode);
      }
      continue;
    }
    if (inlineStart === null) {
      inlineStart = partIndex;
    }
    const inlineNode = renderInlinePart(part, partIndex, isStreaming);
    if (inlineNode !== null && inlineNode !== undefined) {
      inlineNodes.push(inlineNode);
    }
  }
  flushInlineNodes();
  return rendered;
}

const ChatMessageRow = memo(
  ({
    isLastTextAssistant,
    isStreaming,
    message,
    onRegenerate,
  }: {
    isLastTextAssistant: boolean;
    isStreaming: boolean;
    message: UIMessage;
    onRegenerate: () => void;
  }) => {
    const isAssistant = message.role === "assistant";
    const messageText = message.parts
      .filter((part) => part.type === "text")
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("\n\n");

    return (
      <Message data-message-id={message.id} from={message.role}>
        {renderMessageParts(message, isStreaming)}

        {isAssistant && isLastTextAssistant && !isStreaming && (
          <MessageActions>
            <MessageAction
              label="Copy response"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(messageText);
                  playInteractionCue("tap", { emphasis: "subtle" });
                  toast.success("Copied to clipboard");
                } catch {
                  toast.error("Copy failed");
                }
              }}
              tooltip="Copy response"
            >
              <CopyIcon />
            </MessageAction>
            <MessageAction
              label="Regenerate"
              onClick={() => {
                playInteractionCue("tap", { emphasis: "subtle" });
                onRegenerate();
              }}
              tooltip="Regenerate"
            >
              <RefreshCwIcon />
            </MessageAction>
          </MessageActions>
        )}
      </Message>
    );
  }
);

ChatMessageRow.displayName = "ChatMessageRow";

function ChatConversation({
  chatId,
  initialMessages,
  onChatUpdated,
}: {
  chatId: string;
  initialMessages: UIMessage[];
  onChatUpdated?: () => void;
}) {
  // The Chat instance lives outside the React tree: navigating away to
  // another conversation never tears an in-flight stream down, and coming
  // back reattaches to the same instance mid-stream. `resume` also asks the
  // server for a durable run replay on mount, so a chat that kept streaming
  // while the page was closed catches up when it is reopened.
  const chat = getChatInstance(chatId, initialMessages);

  const {
    messages,
    status,
    sendMessage,
    regenerate,
    stop,
    setMessages,
    error,
  } = useChat({ chat, resume: true });

  const isStreaming = status === "submitted" || status === "streaming";
  const isStreamingRef = useRef(isStreaming);
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);
  const reportSendError = useCallback((sendError: unknown) => {
    logger.error("Failed to send chat message", sendError);
    playInteractionCue("error", { emphasis: "subtle" });
    toast.error(
      sendError instanceof Error
        ? sendError.message
        : "Couldn't send the message"
    );
  }, []);
  const sendTextMessage = useCallback(
    async (text: string): Promise<void> => {
      try {
        await sendMessage({ text });
      } catch (sendError: unknown) {
        reportSendError(sendError);
      }
    },
    [reportSendError, sendMessage]
  );
  const regenerateAssistant = useCallback(async (): Promise<void> => {
    playInteractionCue("tap", { emphasis: "subtle" });
    try {
      await regenerate();
    } catch (sendError: unknown) {
      reportSendError(sendError);
    }
  }, [regenerate, reportSendError]);
  // Actions belong under the last assistant message that actually has prose;
  // artifact-only messages are not a copy/regenerate target.
  const lastTextAssistantIndex = messages.findLastIndex(
    (message) =>
      message.role === "assistant" &&
      message.parts.some(
        (part) => part.type === "text" && part.text.trim() !== ""
      )
  );
  const stopSequenceRef = useRef(0);
  const [isSessionPanelOpen, setIsSessionPanelOpen] = useState(false);
  const pendingQuestions = useMemo(
    () => extractPendingQuestions(messages),
    [messages]
  );
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Streamed course chunks: every scaffold/lesson tool completion refreshes
  // the Courses queries, so the course page fills in live while the Director
  // works instead of waiting for the whole stream to end. Only the trailing
  // message can still gain parts, so this never rescans the whole transcript.
  const countedCourseToolCallsRef = useRef(new Set<string>());
  useEffect(() => {
    const trailingMessage = messages.at(-1);
    if (trailingMessage === undefined) {
      return;
    }
    let newCourseChunkCount = 0;
    for (const part of trailingMessage.parts) {
      if (
        isToolUIPart(part) &&
        (part.type === "tool-create_course" ||
          part.type === "tool-create_lesson") &&
        part.state === "output-available"
      ) {
        const toolCallKey = `${trailingMessage.id}:${part.toolCallId}`;
        if (!countedCourseToolCallsRef.current.has(toolCallKey)) {
          countedCourseToolCallsRef.current.add(toolCallKey);
          newCourseChunkCount += 1;
        }
      }
    }
    if (newCourseChunkCount > 0) {
      void queryClient.invalidateQueries({
        queryKey: trpc.courses.pathKey(),
      });
    }
  }, [messages, queryClient, trpc]);

  // Show the left-to-right pulse in the right sidebar while this stream
  // runs, and fire the data-refresh once it settles (even on stop/error).
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    if (isStreaming) {
      wasStreamingRef.current = true;
      markChatStreaming(chatId, titleFromMessages(messages));
      return;
    }
    if (!wasStreamingRef.current) {
      return;
    }
    wasStreamingRef.current = false;
    markChatIdle(chatId);
    // Query invalidation lives in the auth layout's finish subscription so
    // it also runs when this conversation is not mounted.
  }, [chatId, isStreaming, messages]);

  // Sound: fire outcome cues when a watched stream settles. Stop gets its
  // own cue in the submit button's onStop handler.
  const streamSoundStateRef = useRef<"idle" | "running" | "stopped">("idle");
  useEffect(() => {
    if (isStreaming) {
      streamSoundStateRef.current = "running";
      return;
    }
    if (streamSoundStateRef.current !== "running") {
      return;
    }
    streamSoundStateRef.current = "idle";
    if (!error) {
      playInteractionCue("ready", { emphasis: "subtle" });
    }
  }, [isStreaming, error]);

  // Surface stream failures when this conversation is being watched.
  useEffect(() => {
    if (error) {
      toast.error(error.message);
      playInteractionCue("error");
    }
  }, [error]);

  function sendPendingQuestionAnswers(answersText: string): void {
    stopSequenceRef.current += 1;
    clearChatStopped(chatId);
    void sendTextMessage(answersText);
  }

  async function handleMessageSubmit(message: PromptInputMessage) {
    if (Option.isSome(pendingQuestions)) {
      // The question panel owns the input while questions are unanswered
      if (message.text.trim().length > 0) {
        sendPendingQuestionAnswers(message.text);
      }
      return;
    }

    const hasText = message.text.trim().length > 0;

    if (!hasText && message.files.length === 0) {
      toast.error("Write a message first");
      return;
    }

    const unsupportedFile = message.files.find(
      (file) => !isSupportedChatAttachment(file.mediaType)
    );
    if (unsupportedFile !== undefined) {
      toast.error(describeUnsupportedAttachment(unsupportedFile));
      return;
    }

    stopSequenceRef.current += 1;
    clearChatStopped(chatId);
    try {
      // Attachments-only messages carry no placeholder text.
      await (hasText
        ? sendMessage({ files: message.files, text: message.text })
        : sendMessage({ files: message.files }));
      playInteractionCue("tap");
    } catch (sendError: unknown) {
      reportSendError(sendError);
    }
  }

  function handleMessageStop(): void {
    playInteractionCue("close");
    // Consumed before the settle effect runs, so a stopped stream doesn't
    // also play the ready cue.
    streamSoundStateRef.current = "idle";
    const stopSequence = stopSequenceRef.current;
    markChatStopped(chatId);
    stop();

    // The generation is detached from the request, so the stop button must
    // also tell the server run to settle. Once it has, the persisted partial
    // replaces whatever partial text the local stream managed to show.
    void (async () => {
      try {
        const abortResponse = await fetch(
          `/api/chat/${encodeURIComponent(chatId)}/abort`,
          { credentials: "include", method: "POST" }
        );
        if (!abortResponse.ok) {
          // 404: nothing was running server-side; the local settle is enough.
          if (abortResponse.status !== 404) {
            logger.error(
              "Abort endpoint failed",
              abortResponse.status,
              await abortResponse.text().catch(() => "")
            );
          }
          return;
        }
        // A new submit (or navigation to another chat) happened while the
        // abort settled: never overwrite newer local state with this fetch.
        if (
          stopSequenceRef.current !== stopSequence ||
          isStreamingRef.current
        ) {
          return;
        }
        const chatDetail = await queryClient.fetchQuery(
          trpc.chats.get.queryOptions({ chatId })
        );
        if (
          stopSequenceRef.current !== stopSequence ||
          isStreamingRef.current
        ) {
          return;
        }
        const restoredMessages = await restoreUIMessages(chatDetail.messages);
        if (
          stopSequenceRef.current !== stopSequence ||
          isStreamingRef.current
        ) {
          return;
        }
        setMessages(restoredMessages);
        void queryClient.invalidateQueries({
          queryKey: trpc.chats.list.queryKey(),
        });
      } catch (stopError: unknown) {
        logger.error("Failed to stop the server agent run", stopError);
      }
    })();
  }

  return (
    <div className="flex size-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <Conversation className="flex-1">
          <ConversationContent className="mx-auto flex w-full max-w-3xl flex-col px-4 py-6">
            {messages.length === 0 && (
              <>
                <ConversationEmptyState
                  className="min-h-[50vh] flex-1"
                  description="Type a message below to get started."
                  icon={<SparklesIcon className="size-6" />}
                  title="What can I help you with?"
                />
                {!isStreaming && (
                  <Suggestions className="mx-auto max-w-2xl justify-center px-2">
                    {CHAT_STARTER_SUGGESTIONS.map((suggestion) => (
                      <Suggestion
                        key={suggestion}
                        onClick={() => {
                          playInteractionCue("tap", { emphasis: "subtle" });
                          void sendTextMessage(suggestion);
                        }}
                        suggestion={suggestion}
                      />
                    ))}
                  </Suggestions>
                )}
              </>
            )}

            {messages.map((message, messageIndex) => (
              <ChatMessageRow
                isLastTextAssistant={messageIndex === lastTextAssistantIndex}
                isStreaming={isStreaming}
                key={message.id}
                message={message}
                onRegenerate={regenerateAssistant}
              />
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="shrink-0 px-4 pb-4">
          <div className="mx-auto w-full max-w-3xl space-y-3">
            {/* Provider lifts the textarea state so the artifact action can read
              unsent text without prop-drilling. */}
            <PromptInputProvider>
              <PromptInput
                accept={CHAT_ATTACHMENT_ACCEPT}
                globalDrop
                maxFiles={5}
                maxFileSize={MAX_CHAT_ATTACHMENT_BYTES}
                multiple
                onError={(submitError) => {
                  toast.error(submitError.message);
                }}
                onSubmit={handleMessageSubmit}
              >
                {Option.isSome(pendingQuestions) ? (
                  /* While the Director is asking, the input area IS the
                    questionnaire: no textarea, no tools, no submit button. */
                  <PendingQuestionsPanel
                    busy={isStreaming}
                    onAnswered={sendPendingQuestionAnswers}
                    pendingQuestions={pendingQuestions.value}
                  />
                ) : (
                  <>
                    <PromptInputAttachmentsDisplay />
                    <PromptInputBody>
                      <PromptInputTextarea placeholder="Ask Curio anything..." />
                    </PromptInputBody>
                    <PromptInputFooter>
                      <PromptInputTools>
                        <PromptInputActionMenu>
                          <PromptInputActionMenuTrigger />
                          <PromptInputActionMenuContent>
                            <PromptInputActionAddAttachments />
                          </PromptInputActionMenuContent>
                        </PromptInputActionMenu>
                        <ArtifactActionButton
                          chatId={chatId}
                          disabled={isStreaming}
                          onPublished={(artifactResult) => {
                            const artifactMessage: UIMessage = {
                              id: artifactResult.messageId,
                              parts: [
                                {
                                  data: {
                                    content: artifactResult.brief.content,
                                    mediaType: artifactResult.brief.mediaType,
                                    reviewUrl: artifactResult.links.review,
                                    summary: artifactResult.brief.summary,
                                    title: artifactResult.brief.title,
                                  },
                                  type: "data-artifact",
                                },
                              ],
                              role: "assistant",
                            };
                            setMessages((previousMessages) => [
                              ...previousMessages,
                              artifactMessage,
                            ]);
                            onChatUpdated?.();
                          }}
                        />
                        <PromptInputButton
                          aria-label="Session files"
                          className="lg:hidden"
                          onClick={() => {
                            setIsSessionPanelOpen(true);
                          }}
                          variant="ghost"
                        >
                          <PanelRightIcon className="size-4" />
                          <span>Files</span>
                        </PromptInputButton>
                      </PromptInputTools>
                      <PromptInputSubmit
                        disabled={false}
                        onStop={handleMessageStop}
                        status={status}
                      />
                    </PromptInputFooter>
                  </>
                )}
              </PromptInput>
            </PromptInputProvider>
          </div>
        </div>
      </div>

      {/* Right-hand session tracker: artifacts, files, audio, video, links. */}
      <ChatSessionPanel
        messages={messages}
        mobileOpen={isSessionPanelOpen}
        onCloseMobile={() => {
          setIsSessionPanelOpen(false);
        }}
      />
    </div>
  );
}

export default function Chat({
  chatId,
  onChatUpdated,
  persistedMessages,
}: {
  chatId: string;
  onChatUpdated?: () => void;
  persistedMessages?: readonly PersistedChatMessageRecord[];
}) {
  const restoredState = useRestoredMessages(persistedMessages);

  if (restoredState.status === "restoring") {
    return <ChatSkeleton />;
  }

  // useChat only reads `messages` on mount, so the conversation component
  // must not exist before the restored history is ready.
  return (
    <ChatConversation
      chatId={chatId}
      initialMessages={restoredState.messages}
      onChatUpdated={onChatUpdated}
    />
  );
}
