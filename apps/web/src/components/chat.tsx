"use client";

import { useChat } from "@ai-sdk/react";
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
import { isToolUIPart } from "ai";
import type { UIMessage } from "ai";
import { CopyIcon, RefreshCwIcon, SparklesIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  ArtifactActionButton,
  ArtifactInlineView,
  ArtifactToolView,
  InlineFilePartView,
  PromptInputAttachmentsDisplay,
} from "@/components/chat/chat-artifacts";
import {
  ChatSkeleton,
  CourseCreatedNote,
} from "@/components/chat/chat-notes";
import {
  extractPendingQuestions,
  PendingQuestionsPanel,
} from "@/components/chat/chat-questions";

export { ChatSkeleton };
import ChatSessionPanel from "@/components/chat-session-panel";
import {
  getChatInstance,
  markChatIdle,
  markChatStreaming,
  titleFromMessages,
} from "@/utils/chat-runtime";
import {
  playInteractionCue,
} from "@/utils/sound";
import {
  restoreUIMessages,
} from "@/utils/ui-messages";
import {
  toArtifactData,
  toCourseCreatedData,
} from "@/utils/chat-schemas";

export interface PersistedChatMessageRecord {
  readonly id: string;
  readonly role: string;
  readonly parts: unknown;
}

const CREATE_COURSE_TOOL_NAME = "create_course";

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
        console.error("Failed to restore chat messages", error);
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
  // back reattaches to the same instance mid-stream.
  const chat = getChatInstance(chatId, initialMessages);

  const { messages, status, sendMessage, regenerate, stop, setMessages, error } =
    useChat({ chat });

  const isStreaming = status === "submitted" || status === "streaming";
  const pendingQuestions = useMemo(
    () => extractPendingQuestions(messages),
    [messages]
  );

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
    onChatUpdated?.();
  }, [chatId, isStreaming, messages, onChatUpdated]);

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

  function handleMessageSubmit(message: PromptInputMessage) {
    if (pendingQuestions !== null) {
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

    sendMessage({
      files: message.files,
      text: hasText ? message.text : "Sent with attachments",
    });
    playInteractionCue("tap");
  }

  function sendPendingQuestionAnswers(answersText: string): void {
    void sendMessage({ text: answersText });
  }

  return (
    <div className="flex size-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <Conversation className="flex-1">
          <ConversationContent className="mx-auto w-full max-w-3xl px-4 py-6">
            {messages.length === 0 && (
              <>
                <ConversationEmptyState
                  className="min-h-[60%]"
                  description="Type a message below to get started."
                  icon={<SparklesIcon className="size-6" />}
                  title="What can I help you with?"
                />
                <Suggestions className="mx-auto max-w-2xl justify-center px-2">
                  {CHAT_STARTER_SUGGESTIONS.map((suggestion) => (
                    <Suggestion
                      key={suggestion}
                      onClick={() => {
                        sendMessage({ text: suggestion });
                      }}
                      suggestion={suggestion}
                    />
                  ))}
                </Suggestions>
              </>
            )}

            {messages.map((message, messageIndex) => {
              const isAssistant = message.role === "assistant";
              const isLastMessage = messageIndex === messages.length - 1;
              const messageText = message.parts
                .filter((part) => part.type === "text")
                .map((part) => (part.type === "text" ? part.text : ""))
                .join("\n\n");

              return (
                <Message
                  data-message-id={message.id}
                  from={message.role}
                  key={message.id}
                >
                  <MessageContent>
                    {message.parts.map((part, partIndex) => {
                      if (part.type === "text") {
                        return part.text.length > 0 ? (
                          <MessageResponse key={partIndex}>
                            {part.text}
                          </MessageResponse>
                        ) : null;
                      }

                      if (part.type === "reasoning") {
                        // No thought traces yet (either not streamed or the
                        // model emits none) â€” don't render the thinking dropdown.
                        if (part.text.trim().length === 0) {
                          return null;
                        }
                        return (
                          <Reasoning
                            defaultOpen={false}
                            // Aborts and errors leave the in-flight part at
                            // "streaming"; the global status tells us the
                            // stream is truly over, so "Thinking..." stops.
                            isStreaming={
                              part.state === "streaming" && isStreaming
                            }
                            key={partIndex}
                          >
                            <ReasoningTrigger />
                            <ReasoningContent>{part.text}</ReasoningContent>
                          </Reasoning>
                        );
                      }

                      return null;
                    })}
                  </MessageContent>

                  {/* Artifact and tool hangouts render OUTSIDE the w-fit
                    MessageContent so expanding/collapsing the tool card can
                    never reflow (or left-align) a rendered artifact. */}
                  {message.parts.map((part, partIndex) => {
                    const structuralKey = `artifact-structural-${partIndex}`;

                    if (part.type === "data-artifact") {
                      const inlineArtifactData = toArtifactData(part.data);
                      if (!inlineArtifactData) {
                        return null;
                      }
                      return (
                        <ArtifactInlineView
                          data={inlineArtifactData}
                          key={structuralKey}
                        />
                      );
                    }

                    if (part.type === "file") {
                      const fileEntry: ChatAttachmentData = {
                        filename: part.filename,
                        id: `file-${partIndex}`,
                        mediaType: part.mediaType,
                        url: part.url,
                      };

                      return (
                        <InlineFilePartView
                          fileEntry={fileEntry}
                          key={structuralKey}
                        />
                      );
                    }

                    if (isToolUIPart(part)) {
                      if (part.type === `tool-${CREATE_COURSE_TOOL_NAME}`) {
                        if (part.state !== "output-available") {
                          return null;
                        }
                        const createdCourseData = toCourseCreatedData(
                          part.output
                        );
                        if (createdCourseData === null) {
                          return null;
                        }
                        return (
                          <div className="w-full" key={structuralKey}>
                            <CourseCreatedNote courseData={createdCourseData} />
                          </div>
                        );
                      }
                      if (part.type !== "tool-create_artifact") {
                        return null;
                      }
                      // The artifact content is always rendered in the chat
                      // when the publish succeeded; the tool card below it is
                      // just the collapsible run info (parameters, status).
                      const publishedArtifactData =
                        part.state === "output-available"
                          ? toArtifactData(part.input)
                          : null;

                      return (
                        <div className="w-full space-y-2" key={structuralKey}>
                          <ArtifactToolView
                            hideArtifact={publishedArtifactData !== null}
                            part={part}
                          />
                          {publishedArtifactData && (
                            <ArtifactInlineView data={publishedArtifactData} />
                          )}
                        </div>
                      );
                    }

                    return null;
                  })}

                  {isAssistant && isLastMessage && !isStreaming && (
                    <MessageActions>
                      <MessageAction
                        label="Copy response"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(messageText);
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
                          regenerate();
                        }}
                        tooltip="Regenerate"
                      >
                        <RefreshCwIcon />
                      </MessageAction>
                    </MessageActions>
                  )}
                </Message>
              );
            })}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="shrink-0 px-4 pb-4">
          <div className="mx-auto w-full max-w-3xl space-y-3">
            {/* Provider lifts the textarea state so the artifact action can read
              unsent text without prop-drilling. */}
            <PromptInputProvider>
              <PromptInput
                globalDrop
                multiple
                onError={(error) => {
                  toast.error(error.message);
                }}
                onSubmit={handleMessageSubmit}
              >
                {pendingQuestions !== null ? (
                  /* While the Director is asking, the input area IS the
                    questionnaire: no textarea, no tools, no submit button. */
                  <PendingQuestionsPanel
                    busy={isStreaming}
                    onAnswered={sendPendingQuestionAnswers}
                    pendingQuestions={pendingQuestions}
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
                          onPublished={(artifactResult) => {
                            const artifactMessage: UIMessage = {
                              id: `artifact-${crypto.randomUUID().slice(0, 8)}`,
                              parts: [
                                {
                                  data: {
                                    content: artifactResult.brief.content,
                                    mediaType: artifactResult.brief.mediaType,
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
                      </PromptInputTools>
                      <PromptInputSubmit
                        disabled={false}
                        onStop={() => {
                          playInteractionCue("close");
                          // Consumed before the settle effect runs, so a
                          // stopped stream doesn't also play the ready cue.
                          streamSoundStateRef.current = "idle";
                          stop();
                        }}
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
      <ChatSessionPanel messages={messages} />
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
