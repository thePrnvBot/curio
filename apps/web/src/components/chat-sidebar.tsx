import { Button } from "@curio/ui/components/button";
import { Skeleton } from "@curio/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { useChatSidebarLayout } from "@/components/chat-sidebar-layout";
import {
  getStreamingChatsSnapshot,
  requestNewChat,
  subscribeToChatActivity,
} from "@/utils/chat-runtime";
import { playInteractionCue } from "@/utils/sound";
import { useTRPC } from "@/utils/trpc";

function chatRowClass({
  isActive,
  isStreamingRow,
}: {
  isActive: boolean;
  isStreamingRow: boolean;
}): string {
  const base =
    "hover:bg-muted min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-[13px] transition-colors duration-150";
  if (isActive) {
    return `${base} bg-muted text-foreground font-medium`;
  }
  if (isStreamingRow) {
    return `${base} text-foreground`;
  }
  return `${base} text-muted-foreground`;
}

export default function ChatSidebar() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const activeChatId = params.chatId ?? null;
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { isLeftCollapsed: isCollapsed, toggleLeft } = useChatSidebarLayout();

  function startNewChat(): void {
    setIsMobileOpen(false);
    if (window.location.pathname === "/chat") {
      requestNewChat();
      return;
    }
    void navigate({ to: "/chat" });
  }

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
        if (window.location.pathname === `/chat/${variables.chatId}`) {
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
        toggleLeft();
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
      <aside className="bg-sidebar border-border/70 hidden h-full w-11 shrink-0 flex-col items-center border-r py-2 md:flex">
        {collapseToggle}
        <Button
          className="mt-2"
          onClick={startNewChat}
          size="icon-xs"
          variant="outline"
        >
          <PlusIcon />
          <span className="sr-only">New chat</span>
        </Button>
        {streamingChats.length > 0 && (
          <div
            className="bg-muted relative mx-auto mt-auto h-1 w-6 overflow-hidden rounded-full"
            title={`${streamingChats.length} chat${streamingChats.length === 1 ? "" : "s"} working`}
          >
            <div className="animate-chat-activity-sweep via-brand absolute inset-y-0 left-0 h-full w-1/3 rounded-full bg-gradient-to-r from-transparent to-transparent" />
          </div>
        )}
      </aside>
    );
  }

  return (
    <>
      <Button
        aria-label="Open chats"
        className="fixed top-16 left-3 z-40 md:hidden"
        onClick={() => {
          setIsMobileOpen(true);
        }}
        size="icon-sm"
        variant="outline"
      >
        <PanelLeftOpenIcon />
      </Button>
      {isMobileOpen && (
        <button
          aria-label="Close chats"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => {
            setIsMobileOpen(false);
          }}
          type="button"
        />
      )}
      <aside
        className={`bg-sidebar border-border/70 h-full w-64 shrink-0 flex-col border-r max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-72 max-md:shadow-xl ${isMobileOpen ? "max-md:flex" : "max-md:hidden"} md:flex`}
      >
        <div className="flex items-center justify-between px-3 py-2.5">
          <Button
            aria-label="Close chats"
            className="md:hidden"
            onClick={() => {
              setIsMobileOpen(false);
            }}
            size="icon-xs"
            variant="ghost"
          >
            <XIcon />
          </Button>
          <span className="text-muted-foreground text-[11px] font-medium tracking-[0.08em] uppercase">
            Chats
          </span>
          <div className="flex items-center gap-1">
            <Button
              onClick={() => {
                playInteractionCue("navigate", { emphasis: "subtle" });
                startNewChat();
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
        <nav className="flex-1 space-y-0.5 overflow-y-auto overscroll-none px-2 pb-2">
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
          {chatsQuery.isError && (
            <div className="text-muted-foreground space-y-2 p-2 text-xs">
              <p>Could not load chats.</p>
              <button
                className="border-border hover:bg-muted focus-visible:ring-ring rounded-md border px-2 py-1 font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
                onClick={() => {
                  void chatsQuery.refetch();
                }}
                type="button"
              >
                Retry
              </button>
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
                    ? "border-brand/20 bg-brand/5 group/link relative flex items-center overflow-hidden rounded-md border-b"
                    : "group/link flex items-center"
                }
                key={chat.id}
              >
                {isStreamingRow && (
                  <div className="bg-muted/50 absolute inset-x-0 bottom-0 h-0.5 overflow-hidden rounded-full">
                    <div className="animate-chat-activity-sweep via-brand absolute inset-y-0 left-0 h-full w-1/3 bg-gradient-to-r from-transparent to-transparent" />
                  </div>
                )}
                <Link
                  className={chatRowClass({
                    isActive: activeChatId === chat.id,
                    isStreamingRow,
                  })}
                  data-cue="navigate"
                  onClick={() => {
                    setIsMobileOpen(false);
                  }}
                  params={{ chatId: chat.id }}
                  to="/chat/$chatId"
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
                    className={`opacity-0 transition-opacity group-hover/link:opacity-100 focus-visible:opacity-100 max-md:opacity-100 ${
                      activeChatDeletion ? "invisible" : ""
                    }`}
                    disabled={
                      deleteChatMutation.isPending || activeChatDeletion
                    }
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
    </>
  );
}
