import { useQueryClient } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { isToolUIPart } from "ai";
import {
  FileIcon,
  FilmIcon,
  ImageIcon,
  LinkIcon,
  MusicIcon,
  PackageIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { subscribeToChatFinish } from "@/utils/chat-runtime";
import {
  toArtifactToolEntry,
  toInlineDataArtifact,
} from "@/utils/chat-schemas";
import { useTRPC } from "@/utils/trpc";

type SessionEntryKind =
  | "artifact"
  | "image"
  | "video"
  | "audio"
  | "file"
  | "link";

export interface ChatSessionEntry {
  readonly kind: SessionEntryKind;
  /** Stable id for row keys. */
  readonly key: string;
  /** Message id — used to scroll the conversation to the source. */
  readonly messageId: string;
  readonly title: string;
  readonly mediaType?: string;
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
  const parsedInput = toArtifactToolEntry(partInput);
  if (parsedInput === null) {
    return;
  }
  entries.push({
    kind: "artifact",
    key: `tool-${toolCallId}`,
    mediaType: parsedInput.mediaType,
    messageId,
    title: parsedInput.title ?? parsedInput.filename ?? "Artifact",
  });
}

function pushInlineDataArtifactEntry(
  entries: ChatSessionEntry[],
  partData: unknown,
  messageId: string,
  partIndex: number
): void {
  const parsedData = toInlineDataArtifact(partData);
  if (parsedData === null) {
    return;
  }
  entries.push({
    kind: "artifact",
    key: `data-${messageId}-${partIndex}`,
    mediaType: parsedData.mediaType,
    messageId,
    title: parsedData.title ?? "Artifact",
  });
}

function pushSourceUrlEntry(
  entries: ChatSessionEntry[],
  part: Extract<UIMessage["parts"][number], { type: "source-url" }>,
  messageId: string,
  partIndex: number
): void {
  if (typeof part.url !== "string" || part.url.length === 0) {
    return;
  }
  const resolvedTitle =
    typeof part.title === "string" && part.title.length > 0
      ? part.title
      : part.url;
  entries.push({
    kind: "link",
    key: `link-${messageId}-${partIndex}`,
    messageId,
    title: resolvedTitle,
    url: part.url,
  });
}

function pushFilePartEntry(
  entries: ChatSessionEntry[],
  partMedia: { mediaType?: string; filename?: string; url?: string },
  messageId: string,
  partIndex: number
): void {
  const fileMediaType = partMedia.mediaType ?? "";
  const fileTitle =
    typeof partMedia.filename === "string" && partMedia.filename.length > 0
      ? partMedia.filename
      : "Attachment";
  entries.push({
    kind: classifyMediaEntry(fileMediaType),
    key: `file-${messageId}-${partIndex}`,
    mediaType: fileMediaType,
    messageId,
    title: fileTitle,
    url: partMedia.url,
  });
}

function collectSessionEntries(
  messages: readonly UIMessage[]
): readonly ChatSessionEntry[] {
  const entries: ChatSessionEntry[] = [];

  for (const message of messages) {
    for (const [partIndex, part] of message.parts.entries()) {
      if (isToolUIPart(part)) {
        if (part.type === "tool-create_artifact") {
          pushCreateArtifactEntry(
            entries,
            part.input,
            message.id,
            part.toolCallId
          );
        }
        continue;
      }

      if (part.type === "data-artifact") {
        pushInlineDataArtifactEntry(entries, part.data, message.id, partIndex);
        continue;
      }

      if (part.type === "source-url") {
        pushSourceUrlEntry(entries, part, message.id, partIndex);
        continue;
      }

      if (part.type === "file") {
        pushFilePartEntry(entries, part, message.id, partIndex);
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

function SessionEntryRow({ entry }: { entry: ChatSessionEntry }) {
  return (
    <button
      className="hover:bg-muted flex w-full items-center gap-2 rounded-none px-2 py-1.5 text-left text-xs"
      onClick={() => {
        document
          .querySelector(`[data-message-id="${entry.messageId}"]`)
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
      }}
      title={entry.title}
      type="button"
    >
      <span className="bg-muted flex size-6 shrink-0 items-center justify-center">
        <SessionEntryIcon entry={entry} />
      </span>
      <span className="min-w-0 flex-1 truncate">{entry.title}</span>
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
            aria-disabled={isDisabled}
            aria-pressed={isActive}
            className={`border-border text-muted-foreground flex size-7 items-center justify-center border ${stateClass}`}
            key={entryKind}
            onClick={() => {
              if (isDisabled) {
                return;
              }
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
}: {
  messages: readonly UIMessage[];
}) {
  const [selectedKind, setSelectedKind] = useState<SessionEntryKind | null>(
    null
  );
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  useEffect(() => {
    // A background chat finishing (finish, abort or error) invalidates data
    // for the whole app, even if nobody is watching that conversation.
    return subscribeToChatFinish((finishedChatId) => {
      void queryClient.invalidateQueries({
        queryKey: trpc.chats.list.queryKey(),
      });
      void queryClient.invalidateQueries({
        queryKey: trpc.courses.pathKey(),
      });
      void finishedChatId;
    });
  }, [queryClient, trpc]);

  const sessionEntries = collectSessionEntries(messages);
  const visibleEntries =
    selectedKind === null
      ? sessionEntries
      : sessionEntries.filter((entry) => entry.kind === selectedKind);
  const visibleKindOrder: readonly SessionEntryKind[] =
    selectedKind === null ? ENTRY_KIND_ORDER : [selectedKind];

  return (
    <aside className="bg-sidebar hidden w-64 shrink-0 flex-col border-l lg:flex">
      <div className="text-muted-foreground flex items-center justify-between px-3 pt-3 pb-2 text-xs font-medium tracking-wide uppercase">
        <span>Session Files</span>
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
  );
}
