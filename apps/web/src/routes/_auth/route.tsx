import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AppPageSkeleton } from "@/components/page-skeletons";
import { getUser } from "@/functions/get-user";

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
  return <Outlet />;
}
