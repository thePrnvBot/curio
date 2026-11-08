import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import Chat, { ChatSkeleton } from "@/components/chat";
import { subscribeToNewChat } from "@/utils/chat-runtime";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/chat/")({
  component: NewChatRoute,
  pendingComponent: ChatSkeleton,
});

function NewChatRoute() {
  const [newChatId, setNewChatId] = useState(() => crypto.randomUUID());

  // "New chat" in the sidebar already sits on this route; a signal swaps the
  // conversation id in place instead of navigating to the same URL.
  useEffect(
    () =>
      subscribeToNewChat(() => {
        setNewChatId(crypto.randomUUID());
      }),
    []
  );

  return <NewChatComponent chatId={newChatId} key={newChatId} />;
}

function NewChatComponent({ chatId }: { chatId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return (
    <Chat
      chatId={chatId}
      onChatUpdated={() => {
        void queryClient.invalidateQueries({
          queryKey: trpc.chats.list.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.courses.list.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.courses.listBadges.queryKey(),
        });
      }}
    />
  );
}
