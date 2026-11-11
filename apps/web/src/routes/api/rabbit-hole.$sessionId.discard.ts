import { purgeRabbitHoleSession } from "@curio/api/infrastructure/rabbit-hole/sessions";
import { createFileRoute } from "@tanstack/react-router";

import {
  authenticateRabbitHole,
  rabbitHoleJson,
} from "../../utils/rabbit-hole-routes";

/** Discards a finished session: kills the browser profile and forgets the trail. */
export const Route = createFileRoute("/api/rabbit-hole/$sessionId/discard")({
  server: {
    handlers: {
      POST: async ({
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
        purgeRabbitHoleSession(params.sessionId);
        return rabbitHoleJson({ ok: true });
      },
    },
  },
});
