import { Outlet, createFileRoute } from "@tanstack/react-router";

import ChatSidebar from "@/components/chat-sidebar";

export const Route = createFileRoute("/_auth/chat")({
  component: ChatLayout,
});

function ChatLayout() {
  return (
    <div className="flex min-h-0 flex-1">
      <ChatSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
