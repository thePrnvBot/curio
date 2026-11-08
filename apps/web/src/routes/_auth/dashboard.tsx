import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy path kept working: the page was always settings, not a dashboard. */
export const Route = createFileRoute("/_auth/dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/settings" });
  },
});
