import { createFileRoute } from "@tanstack/react-router";

import {
  authenticateRabbitHole,
  createRabbitHoleStreamResponse,
} from "../../utils/rabbit-hole-routes";

/**
 * Live feed for the Rabbit Hole overlay: browser frames plus trail/state
 * updates. Server-sent events keep it to one plain HTTP response, which works
 * with both the dev server and a single-node deployment without a WebSocket
 * upgrade path.
 */
export const Route = createFileRoute("/api/rabbit-hole/$sessionId/stream")({
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
        return createRabbitHoleStreamResponse({
          request,
          session: auth.session,
        });
      },
    },
  },
});
