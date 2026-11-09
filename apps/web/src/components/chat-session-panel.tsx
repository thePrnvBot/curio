import type { UIMessage } from "ai";
import { isToolUIPart } from "ai";
import { Option } from "effect";
import {
  ExternalLinkIcon,
  FileIcon,
  FilmIcon,
  ImageIcon,
  LinkIcon,
  MusicIcon,
  PackageIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  toArtifactToolEntry,
  toInlineDataArtifact,
  toWebReadToolOutput,
  toWebReadToolUrl,
  toWebSearchToolOutput,
} from "@/utils/chat-schemas";

type SessionEntryKind =
  | "artifact"
  | "image"
  | "video"
  | "audio"
  | "file"
  | "link";

type MessagePart = UIMessage["parts"][number];

export interface ChatSessionEntry {
  readonly kind: SessionEntryKind;
  /** Stable id for row keys. */
  readonly key: string;
  /** Message id — used to scroll the conversation to the source. */
  readonly messageId: string;
  readonly title: string;
  /** External destination for link entries. */
  readonly url?: string;
}

const ENTRY_KIND_ORDER: readonly SessionEntryKind[] = [
  "artifact",
  "image",
  "video",
  "audio",
  "file",
  "link",
];

const ENTRY_KIND_LABELS: Record<SessionEntryKind, string> = {
  artifact: "Artifacts",
  image: "Images",
  video: "Video",
  audio: "Audio",
  file: "Files",
  link: "Links",
};

function classifyMediaEntry(mediaType: string): SessionEntryKind {
  if (mediaType.startsWith("image/")) {
    return "image";
  }
  if (mediaType.startsWith("video/")) {
    return "video";
  }
  if (mediaType.startsWith("audio/")) {
    return "audio";
  }
  return "file";
}

function pushCreateArtifactEntry(
  entries: ChatSessionEntry[],
  partInput: unknown,
  messageId: string,
  toolCallId: string
): void {
  const artifactInput = toArtifactToolEntry(partInput);
  if (Option.isNone(artifactInput)) {
    return;
  }
  entries.push({
    kind: "artifact",
    key: `tool-${toolCallId}`,
    messageId,
    // The Director names artifacts; fall back through the filename, then
    // the generic label when the model wrote neither.
    title: Option.getOrElse(
      artifactInput.value.title.pipe(
        Option.orElse(() => artifactInput.value.filename)
      ),
      () => "Artifact"
    ),
  });
}

function pushInlineDataArtifactEntry(
  entries: ChatSessionEntry[],
  partData: unknown,
  messageId: string,
  partIndex: number
): void {
  const inlineArtifact = toInlineDataArtifact(partData);
  if (Option.isNone(inlineArtifact)) {
    return;
  }
  entries.push({
    kind: "artifact",
    key: `data-${messageId}-${partIndex}`,
    messageId,
    title: Option.getOrElse(inlineArtifact.value.title, () => "Artifact"),
  });
}

const HTTP_URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/giu;

/** Trims sentence punctuation and unmatched closing parentheses off a match. */
function trimUrlPunctuation(candidate: string): string {
  let url = candidate.replace(/[.,;:!?]+$/u, "");
  while (url.endsWith(")")) {
    const opens = url.match(/\(/gu)?.length ?? 0;
    const closes = url.match(/\)/gu)?.length ?? 0;
    if (closes <= opens) {
      break;
    }
    url = url.slice(0, -1);
  }
  return url;
}

/** Every http(s) URL in a message part, including markdown links. */
function extractUrls(text: string): readonly string[] {
  const matches = text.match(HTTP_URL_PATTERN) ?? [];
  return matches.map(trimUrlPunctuation).filter((url) => {
    try {
      return new URL(url).hostname.includes(".");
    } catch {
      return false;
    }
  });
}

function pushLinkEntry(
  entries: ChatSessionEntry[],
  seenUrls: Set<string>,
  {
    key,
    messageId,
    title,
    url,
  }: {
    key: string;
    messageId: string;
    title: string;
    url: string;
  }
): void {
  const normalizedUrl = url.trim();
  if (!/^https?:\/\//iu.test(normalizedUrl) || seenUrls.has(normalizedUrl)) {
    return;
  }
  seenUrls.add(normalizedUrl);
  entries.push({
    key: `link-${key}`,
    kind: "link",
    messageId,
    title: title.trim() === "" ? normalizedUrl : title,
    url: normalizedUrl,
  });
}

function pushTextLinks(
  entries: ChatSessionEntry[],
  seenUrls: Set<string>,
  text: string,
  messageId: string,
  partIndex: number
): void {
  for (const url of extractUrls(text)) {
    pushLinkEntry(entries, seenUrls, {
      key: `${messageId}-${partIndex}-${url}`,
      messageId,
      title: url,
      url,
    });
  }
}

function pushWebToolLinks(
  entries: ChatSessionEntry[],
  seenUrls: Set<string>,
  part: MessagePart,
  messageId: string
): void {
  if (part.type === "tool-web_search") {
    Option.map(toWebSearchToolOutput(part.output), (output) => {
      for (const [resultIndex, result] of output.results.entries()) {
        pushLinkEntry(entries, seenUrls, {
          key: `${part.toolCallId}-${resultIndex}`,
          messageId,
          title: result.title,
          url: result.url,
        });
      }
    });
    return;
  }

  if (part.type === "tool-web_read") {
    const outputUrl = Option.flatMap(
      toWebReadToolOutput(part.output),
      (output) => output.url
    );
    const requestedUrl = toWebReadToolUrl(part.input);
    const resolvedUrl = Option.getOrElse(outputUrl, () =>
      Option.getOrNull(requestedUrl)
    );
    if (resolvedUrl === null) {
      return;
    }
    pushLinkEntry(entries, seenUrls, {
      key: part.toolCallId,
      messageId,
      title: resolvedUrl,
      url: resolvedUrl,
    });
  }
}

function pushSourceUrlEntry(
  entries: ChatSessionEntry[],
  seenUrls: Set<string>,
  part: Extract<UIMessage["parts"][number], { type: "source-url" }>,
  messageId: string,
  partIndex: number
): void {
  // The panel lists source citations only when they carry a usable URL.
  const sourceUrl = Option.fromNullishOr(part.url).pipe(
    Option.filter((candidateUrl) => candidateUrl.length > 0)
  );
  if (Option.isNone(sourceUrl)) {
    return;
  }
  pushLinkEntry(entries, seenUrls, {
    key: `${messageId}-${partIndex}`,
    messageId,
    title: Option.match(Option.fromNullishOr(part.title), {
      onNone: () => sourceUrl.value,
      onSome: (sourceTitle) =>
        sourceTitle === "" ? sourceUrl.value : sourceTitle,
    }),
    url: sourceUrl.value,
  });
}

function pushFilePartEntry(
  entries: ChatSessionEntry[],
  partMedia: { mediaType?: string; filename?: string; url?: string },
  messageId: string,
  partIndex: number
): void {
  const fileMediaType = Option.fromNullishOr(partMedia.mediaType);
  entries.push({
    kind: Option.match(fileMediaType, {
      onNone: () => "file" as const,
      onSome: (mediaType) => classifyMediaEntry(mediaType),
    }),
    key: `file-${messageId}-${partIndex}`,
    messageId,
    title: Option.match(Option.fromNullishOr(partMedia.filename), {
      onNone: () => "Attachment",
      onSome: (filename) => (filename.length === 0 ? "Attachment" : filename),
    }),
  });
}

export function collectSessionEntries(
  messages: readonly UIMessage[]
): readonly ChatSessionEntry[] {
  const entries: ChatSessionEntry[] = [];
  const seenUrls = new Set<string>();

  for (const message of messages) {
    for (const [partIndex, part] of message.parts.entries()) {
      if (isToolUIPart(part)) {
        if (
          part.type === "tool-create_artifact" &&
          part.state === "output-available"
        ) {
          pushCreateArtifactEntry(
            entries,
            part.input,
            message.id,
            part.toolCallId
          );
        }
        pushWebToolLinks(entries, seenUrls, part, message.id);
        continue;
      }

      if (part.type === "data-artifact") {
        pushInlineDataArtifactEntry(entries, part.data, message.id, partIndex);
        continue;
      }

      if (part.type === "source-url") {
        pushSourceUrlEntry(entries, seenUrls, part, message.id, partIndex);
        continue;
      }

      if (part.type === "file") {
        pushFilePartEntry(entries, part, message.id, partIndex);
        continue;
      }

      if (part.type === "text") {
        pushTextLinks(entries, seenUrls, part.text, message.id, partIndex);
      }
    }
  }

  return entries;
}

function SessionEntryIcon({ entry }: { entry: ChatSessionEntry }) {
  if (entry.kind === "artifact") {
    return <PackageIcon className="text-muted-foreground size-3.5" />;
  }
  if (entry.kind === "image") {
    return <ImageIcon className="text-muted-foreground size-3.5" />;
  }
  if (entry.kind === "video") {
    return <FilmIcon className="text-muted-foreground size-3.5" />;
  }
  if (entry.kind === "audio") {
    return <MusicIcon className="text-muted-foreground size-3.5" />;
  }
  if (entry.kind === "link") {
    return <LinkIcon className="text-muted-foreground size-3.5" />;
  }
  return <FileIcon className="text-muted-foreground size-3.5" />;
}

/** Breathing room above a message after the transcript jumps to it. */
const MESSAGE_SCROLL_EDGE_PADDING_PX = 16;

/**
 * Finds the nearest element that actually scrolls vertically. The chat
 * transcript lives inside `StickToBottom.Content` (overflow: auto); walking
 * the ancestors keeps this independent of the panel's DOM relationship.
 */
function findScrollableAncestor(element: HTMLElement): HTMLElement | null {
  let ancestor = element.parentElement;
  while (ancestor !== null) {
    const { overflowY } = getComputedStyle(ancestor);
    const handlesVerticalScroll =
      overflowY === "auto" || overflowY === "scroll";
    if (
      handlesVerticalScroll &&
      ancestor.scrollHeight > ancestor.clientHeight
    ) {
      return ancestor;
    }
    ancestor = ancestor.parentElement;
  }
  return null;
}

/**
 * Scrolls the transcript to the message that produced a session entry.
 *
 * `scrollIntoView` is deliberately avoided: it scrolls every ancestor,
 * including `overflow: hidden` ones (the Conversation shell), which leaves the
 * entire chat offset upwards with no scrollbar to move it back. Moving only
 * the real transcript scroller keeps the layout fixed.
 */
function scrollToSessionMessage(messageId: string): void {
  const target = document.querySelector<HTMLElement>(
    `[data-message-id="${CSS.escape(messageId)}"]`
  );
  if (target === null) {
    return;
  }
  const scroller = findScrollableAncestor(target);
  if (scroller === null) {
    return;
  }

  const targetTop =
    scroller.scrollTop +
    target.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top -
    MESSAGE_SCROLL_EDGE_PADDING_PX;
  scroller.scrollTo({
    behavior: "smooth",
    top: Math.max(0, targetTop),
  });
}

function SessionEntryRow({ entry }: { entry: ChatSessionEntry }) {
  const rowContent = (
    <>
      <span className="bg-muted flex size-6 shrink-0 items-center justify-center">
        <SessionEntryIcon entry={entry} />
      </span>
      <span className="min-w-0 flex-1 truncate">{entry.title}</span>
      {entry.url !== undefined && (
        <ExternalLinkIcon
          aria-hidden="true"
          className="text-muted-foreground size-3 shrink-0"
        />
      )}
    </>
  );
  const rowClassName =
    "hover:bg-muted focus-visible:ring-ring flex w-full items-center gap-2 rounded-none px-2 py-1.5 text-left text-xs focus-visible:ring-2 focus-visible:outline-none";

  if (entry.url !== undefined) {
    return (
      <a
        className={rowClassName}
        href={entry.url}
        rel="noreferrer noopener"
        target="_blank"
        title={entry.url}
      >
        {rowContent}
      </a>
    );
  }

  return (
    <button
      className={rowClassName}
      onClick={() => {
        scrollToSessionMessage(entry.messageId);
      }}
      title={entry.title}
      type="button"
    >
      {rowContent}
    </button>
  );
}

function SessionKindFilterBar({
  onSelectKind,
  entries,
  selectedKind,
}: {
  selectedKind: SessionEntryKind | null;
  entries: readonly ChatSessionEntry[];
  onSelectKind: (kind: SessionEntryKind | null) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-1 px-2 pb-2">
      {ENTRY_KIND_ORDER.map((entryKind) => {
        const kindCount = entries.filter(
          (entry) => entry.kind === entryKind
        ).length;
        const isActive = selectedKind === entryKind;
        const isDisabled = kindCount === 0;
        const sampleEntry = entries.find((entry) => entry.kind === entryKind);
        const sampleEntryForIcon =
          sampleEntry ??
          ({
            kind: entryKind,
            key: `unused-${entryKind}`,
            messageId: "",
            title: "",
          } satisfies ChatSessionEntry);

        let stateClass = "hover:bg-muted hover:text-foreground";
        if (isDisabled) {
          stateClass = "cursor-not-allowed opacity-50";
        } else if (isActive) {
          stateClass = "bg-muted text-foreground";
        }
        return (
          <button
            aria-label={`${ENTRY_KIND_LABELS[entryKind]} (${kindCount})`}
            aria-pressed={isActive}
            className={`border-border text-muted-foreground focus-visible:ring-ring flex size-7 items-center justify-center border focus-visible:ring-2 focus-visible:outline-none ${stateClass}`}
            disabled={isDisabled}
            key={entryKind}
            onClick={() => {
              onSelectKind(isActive ? null : entryKind);
            }}
            title={`${ENTRY_KIND_LABELS[entryKind]} (${kindCount})`}
            type="button"
          >
            <span className={isDisabled ? "opacity-40" : undefined}>
              <SessionEntryIcon entry={sampleEntryForIcon} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function ChatSessionPanel({
  messages,
  mobileOpen = false,
  onCloseMobile,
}: {
  messages: readonly UIMessage[];
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const [selectedKind, setSelectedKind] = useState<SessionEntryKind | null>(
    null
  );

  const sessionEntries = useMemo(
    () => collectSessionEntries(messages),
    [messages]
  );
  const visibleEntries = useMemo(
    () =>
      selectedKind === null
        ? sessionEntries
        : sessionEntries.filter((entry) => entry.kind === selectedKind),
    [selectedKind, sessionEntries]
  );
  const visibleKindOrder: readonly SessionEntryKind[] =
    selectedKind === null ? ENTRY_KIND_ORDER : [selectedKind];

  return (
    <>
      {mobileOpen && (
        <button
          aria-label="Close session files"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onCloseMobile}
          type="button"
        />
      )}
      <aside
        className={`bg-sidebar w-64 shrink-0 flex-col border-l max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-50 max-lg:shadow-xl ${
          mobileOpen ? "max-lg:flex" : "hidden lg:flex"
        }`}
      >
        <div className="text-muted-foreground flex items-center justify-between px-3 pt-3 pb-2 text-xs font-medium tracking-wide uppercase">
          <span>Session Files</span>
          <button
            aria-label="Close session files"
            className="hover:bg-accent hover:text-foreground focus-visible:ring-ring rounded-md p-1 focus-visible:ring-2 focus-visible:outline-none lg:hidden"
            onClick={onCloseMobile}
            type="button"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
        <SessionKindFilterBar
          entries={sessionEntries}
          onSelectKind={setSelectedKind}
          selectedKind={selectedKind}
        />
        <div className="flex-1 space-y-3 overflow-y-auto px-2 pb-2">
          {visibleKindOrder.map((entryKind) => {
            const kindEntries = visibleEntries.filter(
              (entry) => entry.kind === entryKind
            );
            if (kindEntries.length === 0) {
              return null;
            }
            return (
              <section key={entryKind}>
                <div className="text-muted-foreground px-2 pb-1 text-[10px] tracking-wide uppercase">
                  {ENTRY_KIND_LABELS[entryKind]} · {kindEntries.length}
                </div>
                <div className="space-y-0.5">
                  {kindEntries.map((entry) => (
                    <SessionEntryRow entry={entry} key={entry.key} />
                  ))}
                </div>
              </section>
            );
          })}
          {visibleEntries.length === 0 && (
            <div className="text-muted-foreground p-2 text-xs">
              Artifacts, files, audio, video, and links from this session appear
              here.
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
