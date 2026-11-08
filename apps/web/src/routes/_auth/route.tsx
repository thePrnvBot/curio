import { useQueryClient } from "@tanstack/react-query";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";

import { AppPageSkeleton } from "@/components/page-skeletons";
import { getUser } from "@/functions/get-user";
import { subscribeToChatFinish } from "@/utils/chat-runtime";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
  // The session check gates every authenticated page; keep the shell filled
  // while it resolves instead of a blank frame.
  pendingComponent: () => <AppPageSkeleton />,
  beforeLoad: async () => {
    const session = await getUser();
    if (!session) {
      throw redirect({
        to: "/login",
      });
    }
    return { session };
  },
  loader: ({ context }) => {
    if (!context.session) {
      throw redirect({
        to: "/login",
      });
    }
  },
});

function AuthLayout() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // A durable run can finish while its chat page is unmounted, or while the
  // user is browsing courses. Refreshing from the auth layout keeps every
  // consumer (sidebar, titles, course fill, badges) current regardless of
  // which page is watching.
  useEffect(
    () =>
      subscribeToChatFinish((finishedChatId) => {
        void queryClient.invalidateQueries({
          queryKey: trpc.chats.list.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.chats.get.queryKey({ chatId: finishedChatId }),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.courses.pathKey(),
        });
      }),
    [queryClient, trpc]
  );

  return <Outlet />;
}
