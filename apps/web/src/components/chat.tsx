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
  FilePlus2Icon,
  RefreshCwIcon,
  SparklesIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import ChatSessionPanel from "@/components/chat-session-panel";
import { restoreUIMessages } from "@/utils/ui-messages";
import type { ArtifactUIData } from "@/utils/ui-messages";

export interface PersistedChatMessageRecord {
  readonly id: string;
  readonly role: string;
  readonly parts: unknown;
}

const CHAT_STARTER_SUGGESTIONS = [
  "Build a landing page artifact and publish it for review",
  "Write a project postmortem as a markdown artifact",
  "Design an SVG logo and publish it for review",
  "Compare optimistic vs pessimistic locking in databases",
] as const;

const CHAT_TRANSPORT_API = "/api/chat";

const ARTIFACT_GENERATION_API = "/api/artifacts/generate";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toChatAttachmentData(
  file: PromptInputMessage["files"][number]
): ChatAttachmentData {
  return {
    filename: file.filename,
    mediaType: file.mediaType,
    url: file.url,
  };
}

function toArtifactData(input: unknown): ArtifactUIData | null {
  if (!isRecord(input)) {
    return null;
  }
  const { content, mediaType } = input;
  if (typeof content !== "string" || typeof mediaType !== "string") {
    return null;
  }
  return {
    content,
    mediaType,
    reviewUrl:
      typeof input.reviewUrl === "string" ? input.reviewUrl : undefined,
    summary: typeof input.summary === "string" ? input.summary : undefined,
    title: typeof input.title === "string" ? input.title : undefined,
  };
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
        const parsedMessage: unknown = JSON.parse(windowMessage.data);
        if (
          isRecord(parsedMessage) &&
          parsedMessage.type === "curio-artifact-height" &&
          typeof parsedMessage.height === "number" &&
          Number.isFinite(parsedMessage.height)
        ) {
          setFrameHeight(
            Math.min(
              Math.max(parsedMessage.height, ARTIFACT_MIN_PREVIEW_HEIGHT),
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
    const failureMessage =
      isRecord(responseBody) && typeof responseBody.error === "string"
        ? responseBody.error
        : `Request failed (${generateResponse.status})`;
    return { message: failureMessage, ok: false };
  }
  if (!isRecord(responseBody)) {
    return { message: "Malformed generation response", ok: false };
  }
  const responseBrief = isRecord(responseBody.brief)
    ? responseBody.brief
    : null;
  const responseLinks = isRecord(responseBody.links)
    ? responseBody.links
    : null;
  if (
    responseBrief === null ||
    typeof responseBrief.content !== "string" ||
    typeof responseBrief.mediaType !== "string" ||
    typeof responseBrief.summary !== "string" ||
    typeof responseBrief.title !== "string" ||
    responseLinks === null ||
    typeof responseLinks.review !== "string"
  ) {
    return { message: "Malformed generation response", ok: false };
  }
  return {
    ok: true,
    result: {
      brief: {
        content: responseBrief.content,
        mediaType: responseBrief.mediaType,
        summary: responseBrief.summary,
        title: responseBrief.title,
      },
      links: { review: responseLinks.review },
    },
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

  function handleMessageSubmit(message: PromptInputMessage) {
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

                    if (part.type === "file" && isRecord(part)) {
                      const fileEntry: ChatAttachmentData = {
                        filename:
                          typeof part.filename === "string"
                            ? part.filename
                            : undefined,
                        id: `file-${partIndex}`,
                        mediaType:
                          typeof part.mediaType === "string"
                            ? part.mediaType
                            : undefined,
                        url:
                          typeof part.url === "string" && part.url.length > 0
                            ? part.url
                            : undefined,
                      };

                      return (
                        <InlineFilePartView
                          fileEntry={fileEntry}
                          key={structuralKey}
                        />
                      );
                    }

                    if (isToolUIPart(part)) {
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
    return (
      <div className="text-muted-foreground flex size-full items-center justify-center text-sm">
        Restoring conversation...
      </div>
    );
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
