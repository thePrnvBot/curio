import { createFileRoute, redirect } from "@tanstack/react-router";
import { isTRPCClientError } from "@trpc/client";

import Chat, { ChatSkeleton } from "@/components/chat";

export const Route = createFileRoute("/_auth/chat/$chatId")({
  loader: async ({ context, params }) => {
    const queryOptions = context.trpc.chats.get.queryOptions({
      chatId: params.chatId,
    });
    try {
      const chatDetail =
        await context.queryClient.ensureQueryData(queryOptions);
      return { chatDetail };
    } catch (error) {
      // The loader runs through the tRPC client on both the server and the
      // browser, so a missing chat surfaces as a client error, not the server
      // `TRPCError` class.
      if (isTRPCClientError(error) && error.data?.code === "NOT_FOUND") {
        throw redirect({ to: "/chat" });
      }
      throw error;
    }
  },
  component: ExistingChatRoute,
  pendingComponent: ChatSkeleton,
});

function ExistingChatRoute() {
  const { chatDetail } = Route.useLoaderData();

  return (
    <Chat
      key={chatDetail.summary.id}
      chatId={chatDetail.summary.id}
      persistedMessages={chatDetail.messages}
    />
  );
}
