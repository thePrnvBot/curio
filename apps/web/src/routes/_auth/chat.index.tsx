import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import Chat from "@/components/chat";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/chat/")({
  component: NewChatRoute,
});

function NewChatRoute() {
  const newChatId = useMemo(() => crypto.randomUUID(), []);

  return <NewChatComponent chatId={newChatId} />;
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
      }}
    />
  );
}
