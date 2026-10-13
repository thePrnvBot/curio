"use client";

import { useChat } from "@ai-sdk/react";
import {
  Attachments,
  ChatAttachment,
} from "@curio/ui/components/ai-elements/attachments";
import type { ChatAttachmentData } from "@curio/ui/components/ai-elements/attachments";
import { CodeBlock } from "@curio/ui/components/ai-elements/code-block";
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
  PromptInputHeader,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  usePromptInputController,
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
import {
  Tool,
  ToolContent,
  ToolErrorDisplay,
  ToolHeader,
  ToolInput,
} from "@curio/ui/components/ai-elements/tool";
import { DefaultChatTransport, isToolUIPart } from "ai";
import type { ToolUIPart, UIMessage } from "ai";
import {
  CopyIcon,
  BookOpenCheckIcon,
  FilePlus2Icon,
  RefreshCwIcon,
  SparklesIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Skeleton } from "@curio/ui/components/skeleton";

import ChatSessionPanel from "@/components/chat-session-panel";
import {
  decodeArtifactHeight,
  decodeGeneratedArtifactError,
  PendingQuestions,
  toArtifactData,
  toCourseCreatedData,
  toGeneratedArtifactResponse,
  toPendingQuestions,
} from "@/utils/chat-schemas";
import {
  restoreUIMessages,
} from "@/utils/ui-messages";
import type { ArtifactUIData } from "@/utils/ui-messages";

export interface PersistedChatMessageRecord {
  readonly id: string;
  readonly role: string;
  readonly parts: unknown;
}

const ASK_USER_TOOL_NAME = "ask_user";
const CREATE_COURSE_TOOL_NAME = "create_course";

const CHAT_STARTER_SUGGESTIONS = [
  "Build a landing page artifact and publish it for review",
  "Write a project postmortem as a markdown artifact",
  "Design an SVG logo and publish it for review",
  "Compare optimistic vs pessimistic locking in databases",
] as const;

const CHAT_TRANSPORT_API = "/api/chat";

const ARTIFACT_GENERATION_API = "/api/artifacts/generate";

function toChatAttachmentData(
  file: PromptInputMessage["files"][number]
): ChatAttachmentData {
  return {
    filename: file.filename,
    mediaType: file.mediaType,
    url: file.url,
  };
}

function extractPendingQuestions(
  messages: readonly UIMessage[]
): PendingQuestions | null {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex--) {
    const candidateMessage = messages[messageIndex];
    if (candidateMessage.role !== "assistant") {
      // The panel only applies to the most recent exchange
      break;
    }
    for (const part of candidateMessage.parts) {
      if (
        isToolUIPart(part) &&
        part.type === `tool-${ASK_USER_TOOL_NAME}` &&
        part.state !== "output-available" &&
        part.state !== "output-error"
      ) {
        return toPendingQuestions(part.input);
      }
    }
    break;
  }
  return null;
}

function codeBlockLanguage(mediaType: string): string {
  if (mediaType === "application/json") {
    return "json";
  }
  if (mediaType === "text/css") {
    return "css";
  }
  if (mediaType === "text/javascript") {
    return "javascript";
  }
  return "text";
}

function injectHeightProbe(htmlContent: string): string {
  const heightProbe =
    "<script>(function(){var lastHeight=0,post=function(){var height=document.documentElement.scrollHeight;if(height!==lastHeight){lastHeight=height;parent.postMessage(JSON.stringify({type:'curio-artifact-height',height:height}),'*')}};window.addEventListener('load',post);if(document.readyState!=='loading'){post()}if('ResizeObserver' in window){new ResizeObserver(post).observe(document.documentElement)}})();</script>";
  const bodyCloserRegex = /<\/body>/u;
  if (bodyCloserRegex.test(htmlContent)) {
    return htmlContent.replace(bodyCloserRegex, `${heightProbe}</body>`);
  }
  return htmlContent + heightProbe;
}

const ARTIFACT_MIN_PREVIEW_HEIGHT = 120;
const ARTIFACT_MAX_PREVIEW_HEIGHT = 10_000;

function InlineFilePartView({ fileEntry }: { fileEntry: ChatAttachmentData }) {
  if (
    fileEntry.mediaType !== undefined &&
    fileEntry.mediaType.startsWith("image/") &&
    fileEntry.url !== undefined
  ) {
    return (
      <img
        alt={fileEntry.filename ?? "Image attachment"}
        className="max-h-80 w-auto max-w-md rounded-lg border"
        src={fileEntry.url}
      />
    );
  }

  if (
    fileEntry.mediaType !== undefined &&
    fileEntry.mediaType.startsWith("video/") &&
    fileEntry.url !== undefined
  ) {
    return (
      <video
        className="max-h-80 w-full max-w-md rounded-lg border"
        controls
        src={fileEntry.url}
      >
        <track kind="captions" />
      </video>
    );
  }

  if (
    fileEntry.mediaType !== undefined &&
    fileEntry.mediaType.startsWith("audio/") &&
    fileEntry.url !== undefined
  ) {
    return (
      <audio className="w-full max-w-md" controls>
        <track kind="captions" />
        <source src={fileEntry.url} />
      </audio>
    );
  }

  return <ChatAttachment attachment={fileEntry} />;
}

function ArtifactPreviewer({ data }: { data: ArtifactUIData }) {
  const htmlFrameRef = useRef<HTMLIFrameElement>(null);
  const [frameHeight, setFrameHeight] = useState(ARTIFACT_MIN_PREVIEW_HEIGHT);
  useEffect(() => {
    // Sizing is content-driven: the sandboxed artifact itself reports its
    // document height, so nothing ever scrolls inside the frame.
    function handleWindowMessage(windowMessage: MessageEvent): void {
      if (windowMessage.source !== htmlFrameRef.current?.contentWindow) {
        return;
      }
      if (typeof windowMessage.data !== "string") {
        return;
      }
      try {
        const probeHeight = decodeArtifactHeight(
          JSON.parse(windowMessage.data)
        );
        if (
          probeHeight !== null &&
          Number.isFinite(probeHeight)
        ) {
          setFrameHeight(
            Math.min(
              Math.max(probeHeight, ARTIFACT_MIN_PREVIEW_HEIGHT),
              ARTIFACT_MAX_PREVIEW_HEIGHT
            )
          );
        }
      } catch {
        // Non-JSON messages from the artifact are ignored.
      }
    }

    window.addEventListener("message", handleWindowMessage);
    return () => {
      window.removeEventListener("message", handleWindowMessage);
    };
  }, []);

  // New content may report a different height; reset synchronously during
  // render (React's derived-state pattern) so the correct size is shown first.
  const [reportedContent, setReportedContent] = useState(data.content);
  let displayArtifactHeight = frameHeight;
  if (reportedContent !== data.content) {
    setReportedContent(data.content);
    setFrameHeight(ARTIFACT_MIN_PREVIEW_HEIGHT);
    displayArtifactHeight = ARTIFACT_MIN_PREVIEW_HEIGHT;
  }

  if (data.mediaType === "text/html") {
    return (
      <iframe
        className="bg-background w-full rounded-md border-x border-b"
        ref={htmlFrameRef}
        // Interactive artifacts: scripts and forms run, but the frame keeps a
        // null origin — meaning no access to Curio's cookies, storage, DOM, or
        // any httpOnly session cookie, no same-origin reads, and no top-level
        // navigation out of the artifact.
        sandbox="allow-scripts allow-forms"
        srcDoc={injectHeightProbe(data.content)}
        style={{ height: `${displayArtifactHeight}px` }}
        title={data.title ?? "Artifact preview"}
      />
    );
  }
  if (data.mediaType === "image/svg+xml") {
    return (
      <img
        alt={data.title ?? "Artifact preview"}
        className="max-h-[420px] w-full rounded-md"
        src={`data:image/svg+xml;utf8,${encodeURIComponent(data.content)}`}
      />
    );
  }
  if (data.mediaType === "text/markdown") {
    return (
      <div className="text-sm">
        <MessageResponse>{data.content}</MessageResponse>
      </div>
    );
  }
  return (
    <CodeBlock
      code={data.content}
      language={codeBlockLanguage(data.mediaType) as never}
    />
  );
}

function ArtifactInlineView({ data }: { data: ArtifactUIData }) {
  return (
    <div className="bg-card mx-auto w-full max-w-xl overflow-hidden rounded-lg border">
      {data.title !== undefined && (
        <div className="bg-background/60 text-muted-foreground flex items-center justify-between gap-2 border-b px-3 py-1.5 text-xs font-medium">
          <span className="min-w-0 truncate">{data.title}</span>
        </div>
      )}
      <div className="p-2">
        <ArtifactPreviewer data={data} />
      </div>
      {data.summary !== undefined && (
        <p className="text-muted-foreground border-t px-3 py-2 text-xs">
          {data.summary}
        </p>
      )}
    </div>
  );
}

function ArtifactToolView({
  hideArtifact,
  part,
}: {
  hideArtifact: boolean;
  part: ToolUIPart;
}) {
  const inlineArtifactoryData = hideArtifact
    ? null
    : toArtifactData(part.input);

  return (
    <Tool defaultOpen={part.state !== "output-available"}>
      <ToolHeader state={part.state} type={part.type} />
      <ToolContent>
        {part.input !== undefined && <ToolInput input={part.input} />}
        {part.state === "output-error" && (
          <ToolErrorDisplay>{part.errorText}</ToolErrorDisplay>
        )}
        {part.state === "output-available" && inlineArtifactoryData && (
          <ArtifactPreviewer data={inlineArtifactoryData} />
        )}
      </ToolContent>
    </Tool>
  );
}

type RestoredMessagesState =
  | { readonly status: "restoring" }
  | { readonly status: "ready"; readonly messages: UIMessage[] };

function PromptInputAttachmentsDisplay() {
  const attachments = usePromptInputAttachments();

  if (attachments.files.length === 0) {
    return null;
  }

  // Only mount the header addon when attachments exist — an always-on header
  // leaves a phantom padded strip between the top border and the textarea.
  return (
    <PromptInputHeader>
      <Attachments className="px-2 pt-1">
        {attachments.files.map((file) => (
          <ChatAttachment
            attachment={toChatAttachmentData(file)}
            key={file.id}
            onRemove={(attachmentId) => {
              attachments.remove(attachmentId);
            }}
          />
        ))}
      </Attachments>
    </PromptInputHeader>
  );
}

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

interface GeneratedArtifactResponse {
  readonly brief: {
    readonly content: string;
    readonly mediaType: string;
    readonly summary: string;
    readonly title: string;
  };
  readonly links: { readonly review: string };
}

async function requestArtifactGeneration(
  promptText: string
): Promise<
  | { readonly ok: true; readonly result: GeneratedArtifactResponse }
  | { readonly ok: false; readonly message: string }
> {
  const generateResponse = await fetch(ARTIFACT_GENERATION_API, {
    body: JSON.stringify({ prompt: promptText }),
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const responseBody: unknown = await generateResponse.json().catch(() => null);
  if (!generateResponse.ok) {
    return {
      message:
        decodeGeneratedArtifactError(responseBody) ??
        `Request failed (${generateResponse.status})`,
      ok: false,
    };
  }
  const parsedResponse = toGeneratedArtifactResponse(responseBody);
  if (parsedResponse === null) {
    return { message: "Malformed generation response", ok: false };
  }
  return {
    ok: true,
    result: parsedResponse,
  };
}

function ArtifactActionButton({
  onPublished,
}: {
  onPublished: (artifactResult: GeneratedArtifactResponse) => void;
}) {
  const controller = usePromptInputController();
  const [isGenerating, setIsGenerating] = useState(false);

  async function generateArtifact(): Promise<unknown> {
    const promptText = controller.textInput.value.trim();
    if (promptText === "") {
      toast.error("Describe the artifact in the input first");
      return undefined;
    }

    setIsGenerating(true);
    const outcome = await requestArtifactGeneration(promptText);
    setIsGenerating(false);

    if (!outcome.ok) {
      toast.error(outcome.message);
      return undefined;
    }

    onPublished(outcome.result);
    controller.textInput.clear();
    toast.success(`Artifact "${outcome.result.brief.title}" published`);
    return undefined;
  }

  return (
    <PromptInputButton
      onClick={() => {
        void generateArtifact();
      }}
      variant={isGenerating ? "default" : "ghost"}
    >
      <FilePlus2Icon className="size-4" />
      <span>Artifact</span>
    </PromptInputButton>
  );
}

function PendingQuestionsPanel({
  busy,
  onAnswered,
  pendingQuestions,
}: {
  busy: boolean;
  onAnswered: (answersText: string) => void;
  pendingQuestions: PendingQuestions;
}) {
  const initialAnswers: (string | null)[] = pendingQuestions.questions.map(
    () => null
  );
  const [selectedOptions, setSelectedOptions] = useState(initialAnswers);
  const allAnswered = selectedOptions.every(
    (selectedOption) => selectedOption !== null
  );

  function sendAnswers(): void {
    const header = pendingQuestions.intro;
    const answerLines = pendingQuestions.questions.map(
      (question, questionIndex) => {
        const answer = selectedOptions[questionIndex] ?? "";
        return `- ${question.question}: ${answer}`;
      }
    );
    onAnswered([header, ...answerLines].join("\n"));
  }

  return (
    <div className="px-3 py-3">
      <p className="text-muted-foreground mb-3 text-xs leading-relaxed">
        {pendingQuestions.intro}
      </p>
      <div className="space-y-3">
        {pendingQuestions.questions.map((question, questionIndex) => (
          <div key={question.question}>
            <p className="mb-1.5 text-sm font-medium">{question.question}</p>
            <div className="flex flex-wrap gap-1.5">
              {question.options.map((option) => {
                const isSelected = selectedOptions[questionIndex] === option;
                return (
                  <button
                    aria-pressed={isSelected}
                    className={
                      isSelected
                        ? "bg-primary text-primary-foreground rounded-md px-2.5 py-1 text-xs font-medium"
                        : "hover:bg-accent hover:text-accent-foreground text-muted-foreground rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
                    }
                    key={option}
                    onClick={() => {
                      setSelectedOptions((previousOptions) => {
                        const nextOptions = [...previousOptions];
                        nextOptions[questionIndex] = isSelected ? null : option;
                        return nextOptions;
                      });
                    }}
                    type="button"
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!allAnswered || busy}
          onClick={sendAnswers}
          type="button"
        >
          {allAnswered ? "Send answers" : "Answer all questions"}
        </button>
      </div>
    </div>
  );
}

function CourseCreatedNote({
  courseData,
}: {
  courseData: {
    readonly lessonCount: number;
    readonly title: string;
  };
}) {
  return (
    <div className="bg-card flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
        <BookOpenCheckIcon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          Course ready: {courseData.title}
        </p>
        <p className="text-muted-foreground text-xs">
          {courseData.lessonCount} lessons added -
          <a
            className="text-primary ml-1 font-medium underline underline-offset-2"
            href="/courses"
          >
            open the Courses tab
          </a>
        </p>
      </div>
    </div>
  );
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
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: CHAT_TRANSPORT_API,
        credentials: "include",
        prepareSendMessagesRequest: ({ id, messages, messageId, trigger }) => ({
          body: {
            id,
            messageId,
            trigger,
            message: messages.at(-1),
          },
        }),
      }),
    []
  );

  const { messages, status, sendMessage, regenerate, stop, setMessages } =
    useChat({
      id: chatId,
      messages: initialMessages,
      onFinish: () => {
        onChatUpdated?.();
      },
      transport,
      onError: (error) => {
        toast.error(error.message);
      },
    });

  const isStreaming = status === "submitted" || status === "streaming";
  const pendingQuestions = useMemo(
    () => extractPendingQuestions(messages),
    [messages]
  );

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
                        // model emits none) — don't render the thinking dropdown.
                        if (part.text.trim().length === 0) {
                          return null;
                        }
                        return (
                          <Reasoning
                            isStreaming={part.state === "streaming"}
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
                {pendingQuestions !== null && (
                  <PendingQuestionsPanel
                    busy={isStreaming}
                    onAnswered={sendPendingQuestionAnswers}
                    pendingQuestions={pendingQuestions}
                  />
                )}
                {pendingQuestions === null && <PromptInputAttachmentsDisplay />}
                {pendingQuestions === null && (
                  <PromptInputBody>
                    <PromptInputTextarea placeholder="Ask Curio anything..." />
                  </PromptInputBody>
                )}
                <PromptInputFooter>
                  <PromptInputTools>
                    {pendingQuestions === null && (
                      <>
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
                      </>
                    )}
                  </PromptInputTools>
                  <PromptInputSubmit
                    disabled={false}
                    onStop={() => {
                      stop();
                    }}
                    status={status}
                  />
                </PromptInputFooter>
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

/** Skeleton view shown while the restored conversation loads. */
export function ChatSkeleton() {
  return (
    <div className="flex size-full flex-col overflow-hidden">
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 overflow-hidden px-4 py-6">
        <div className="flex justify-start">
          <Skeleton className="h-14 w-2/3 rounded-2xl" />
        </div>
        <div className="flex justify-end">
          <Skeleton className="h-10 w-1/2 rounded-2xl" />
        </div>
        <div className="flex justify-start">
          <Skeleton className="h-24 w-3/4 rounded-2xl" />
        </div>
        <div className="flex justify-end">
          <Skeleton className="h-8 w-1/3 rounded-2xl" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    </div>
  );
}

/** Skeleton view shown while the restored conversation loads. */
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
