import { Button } from "@curio/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useTRPC } from "@/utils/trpc";

export default function ChatSidebar() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const activeChatId = params.chatId ?? null;
  const [isCollapsed, setIsCollapsed] = useState(false);

  const chatsQuery = useQuery(trpc.chats.list.queryOptions());

  const deleteChatMutation = useMutation(
    trpc.chats.remove.mutationOptions({
      onSuccess: async (_data, variables) => {
        await queryClient.invalidateQueries({
          queryKey: trpc.chats.list.queryKey(),
        });
        if (variables.chatId === activeChatId) {
          await navigate({ to: "/chat" });
        }
        toast.success("Chat deleted");
      },
      onError: (error) => {
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
          <div className="text-muted-foreground p-2 text-xs">
            Loading chats...
          </div>
        )}
        {chatsQuery.data?.length === 0 && (
          <div className="text-muted-foreground p-2 text-xs">
            No chats yet. Start a conversation!
          </div>
        )}
        {chatsQuery.data?.map((chat) => (
          <div className="group/link flex items-center" key={chat.id}>
            <Link
              className={`hover:bg-muted min-w-0 flex-1 truncate px-2 py-1.5 text-xs ${
                activeChatId === chat.id
                  ? "bg-muted font-medium"
                  : "text-muted-foreground"
              }`}
              to="/chat/$chatId"
              params={{ chatId: chat.id }}
            >
              {chat.title}
            </Link>
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
          </div>
        ))}
      </nav>
    </aside>
  );
}
