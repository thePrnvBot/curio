"use client";

import {
  Attachments,
  ChatAttachment,
} from "@curio/ui/components/ai-elements/attachments";
import type { ChatAttachmentData } from "@curio/ui/components/ai-elements/attachments";
import { CodeBlock } from "@curio/ui/components/ai-elements/code-block";
import {
  MessageResponse,
} from "@curio/ui/components/ai-elements/message";
import {
  PromptInputButton,
  PromptInputHeader,
  usePromptInputAttachments,
  usePromptInputController,
} from "@curio/ui/components/ai-elements/prompt-input";
import {
  Tool,
  ToolContent,
  ToolErrorDisplay,
  ToolHeader,
  ToolInput,
} from "@curio/ui/components/ai-elements/tool";
import type { ToolUIPart } from "ai";
import { FilePlus2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  decodeArtifactHeight,
  decodeGeneratedArtifactError,
  toArtifactData,
  toGeneratedArtifactResponse,
} from "@/utils/chat-schemas";
import type { ArtifactUIData } from "@/utils/ui-messages";
import type { PromptInputMessage } from "@curio/ui/components/ai-elements/prompt-input";
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

export function InlineFilePartView({ fileEntry }: { fileEntry: ChatAttachmentData }) {
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

export function ArtifactPreviewer({ data }: { data: ArtifactUIData }) {
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

export function ArtifactInlineView({ data }: { data: ArtifactUIData }) {
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

export function ArtifactToolView({
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

export function PromptInputAttachmentsDisplay() {
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

export function ArtifactActionButton({
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
