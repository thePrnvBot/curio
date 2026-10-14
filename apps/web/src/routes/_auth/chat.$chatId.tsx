import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { TRPCError } from "@trpc/server";

import Chat, { ChatSkeleton } from "@/components/chat";
import { useTRPC } from "@/utils/trpc";

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
      if (error instanceof TRPCError && error.code === "NOT_FOUND") {
        throw redirect({ to: "/chat" });
      }
      throw error;
    }
  },
  component: ExistingChatRoute,
  pendingComponent: ChatSkeleton,
});

function ExistingChatRoute() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { chatDetail } = Route.useLoaderData();

  return (
    <Chat
      key={chatDetail.summary.id}
      chatId={chatDetail.summary.id}
      persistedMessages={chatDetail.messages}
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
