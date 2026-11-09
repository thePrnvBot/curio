import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import Chat, { ChatSkeleton } from "@/components/chat";
import { subscribeToNewChat } from "@/utils/chat-runtime";

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
  return <Chat chatId={chatId} />;
}
