import { createFileRoute } from "@tanstack/react-router";

import {
  authenticateRabbitHole,
  rabbitHoleJson,
} from "../../utils/rabbit-hole-routes";

/** Snapshot used to reattach to a session after a reload. */
export const Route = createFileRoute("/api/rabbit-hole/$sessionId")({
  server: {
    handlers: {
      GET: async ({
        request,
        params,
      }: {
        request: Request;
        params: { sessionId: string };
      }) => {
        const auth = await authenticateRabbitHole(request, params.sessionId);
        if (!auth.ok) {
          return auth.response;
        }
        return rabbitHoleJson({
          highlights: auth.session.browser.getHighlights(),
          notes: auth.session.browser.getNotes(),
          state: auth.session.browser.getState(),
          visits: auth.session.browser.getVisitsForDisplay(),
        });
      },
    },
  },
});
