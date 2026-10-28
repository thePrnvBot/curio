import { Button } from "@curio/ui/components/button";
import { Skeleton } from "@curio/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import {
  getStreamingChatsSnapshot,
  subscribeToChatActivity,
} from "@/utils/chat-runtime";
import { playInteractionCue } from "@/utils/sound";
import { useTRPC } from "@/utils/trpc";

export default function ChatSidebar() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const activeChatId = params.chatId ?? null;
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Live activity store: which conversations have a Director stream running
  // right now, even the ones nobody is watching.
  const streamingChats = useSyncExternalStore(
    subscribeToChatActivity,
    getStreamingChatsSnapshot,
    getStreamingChatsSnapshot
  );
  const streamingChatIds = new Set(
    streamingChats.map((streamingChat) => streamingChat.chatId)
  );

  const chatsQuery = useQuery(trpc.chats.list.queryOptions());

  const deleteChatMutation = useMutation(
    trpc.chats.remove.mutationOptions({
      onSuccess: async (_data, variables) => {
        playInteractionCue("close", { emphasis: "strong" });
        await queryClient.invalidateQueries({
          queryKey: trpc.chats.list.queryKey(),
        });
        if (variables.chatId === activeChatId) {
          await navigate({ to: "/chat" });
        }
        toast.success("Chat deleted");
      },
      onError: (error) => {
        playInteractionCue("error", { emphasis: "subtle" });
        toast.error(error.message);
      },
    })
  );

  const activeChatDeletion =
    activeChatId !== null &&
    deleteChatMutation.variables?.chatId === activeChatId;

  const collapseToggle = (
    <Button
      aria-label={
        isCollapsed ? "Expand chats sidebar" : "Collapse chats sidebar"
      }
      onClick={() => {
        playInteractionCue("toggle", { emphasis: "subtle" });
        setIsCollapsed((previous) => !previous);
      }}
      size="icon-xs"
      variant="ghost"
    >
      {isCollapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
      <span className="sr-only">Toggle chats sidebar</span>
    </Button>
  );

  if (isCollapsed) {
    return (
      <aside className="bg-sidebar flex h-full w-10 shrink-0 flex-col items-center border-r py-2">
        {collapseToggle}
        <Button
          onClick={() => {
            navigate({ to: "/chat" });
          }}
          size="icon-xs"
          variant="outline"
          className="mt-2"
        >
          <PlusIcon />
          <span className="sr-only">New chat</span>
        </Button>
        {streamingChats.length > 0 && (
          <div
            className="bg-muted relative mx-auto mt-auto h-1 w-6 overflow-hidden rounded-full"
            title={`${streamingChats.length} chat${streamingChats.length === 1 ? "" : "s"} working`}
          >
            <div className="animate-chat-activity-sweep from-transparent via-primary to-transparent absolute inset-y-0 left-0 h-full w-1/3 rounded-full bg-gradient-to-r" />
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside className="bg-sidebar flex h-full w-64 shrink-0 flex-col border-r">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Chats
        </span>
        <div className="flex items-center gap-1">
          <Button
            onClick={() => {
              playInteractionCue("navigate", { emphasis: "subtle" });
              navigate({ to: "/chat" });
            }}
            size="icon-xs"
            variant="outline"
          >
            <PlusIcon />
            <span className="sr-only">New chat</span>
          </Button>
          {collapseToggle}
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
        {chatsQuery.isLoading && (
          <div aria-busy="true" className="space-y-0.5 p-2">
            {[0, 1, 2, 3].map((chatRow) => (
              <Skeleton
                className="h-6 w-full rounded-md"
                key={`chats-loading-${chatRow}`}
              />
            ))}
          </div>
        )}
        {chatsQuery.data?.length === 0 && (
          <div className="text-muted-foreground p-2 text-xs">
            No chats yet. Start a conversation!
          </div>
        )}
        {chatsQuery.data?.map((chat) => {
          const isStreamingRow = streamingChatIds.has(chat.id);
          return (
            <div
              className={
                isStreamingRow
                  ? "border-primary/20 bg-primary/5 group/link relative flex items-center overflow-hidden border-b"
                  : "group/link flex items-center"
              }
              key={chat.id}
            >
              {isStreamingRow && (
                <div className="bg-muted/50 absolute inset-x-0 bottom-0 h-0.5 overflow-hidden rounded-full">
                  <div className="animate-chat-activity-sweep from-transparent via-primary to-transparent absolute inset-y-0 left-0 h-full w-1/3 bg-gradient-to-r" />
                </div>
              )}
              <Link
                className={`hover:bg-muted min-w-0 flex-1 truncate px-2 py-1.5 text-xs ${
                  activeChatId === chat.id
                    ? "bg-muted font-medium"
                    : isStreamingRow
                      ? "text-foreground"
                      : "text-muted-foreground"
                }`}
                data-cue="navigate"
                to="/chat/$chatId"
                params={{ chatId: chat.id }}
              >
                {chat.title}
              </Link>
              {isStreamingRow ? (
                <span
                  aria-hidden="true"
                  className="text-muted-foreground mr-1 text-[10px]"
                  title="Director is working…"
                >
                  ···
                </span>
              ) : (
                <Button
                  aria-label={`Delete chat ${chat.title}`}
                  className={`opacity-0 transition-opacity group-hover/link:opacity-100 ${
                    activeChatDeletion ? "invisible" : ""
                  }`}
                  disabled={deleteChatMutation.isPending}
                  onClick={() => {
                    deleteChatMutation.mutate({ chatId: chat.id });
                  }}
                  size="xs"
                  variant="ghost"
                >
                  <TrashIcon />
                  <span className="sr-only">Delete chat</span>
                </Button>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
