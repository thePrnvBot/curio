import { endRabbitHoleSession } from "@curio/api/infrastructure/rabbit-hole/sessions";
import { createFileRoute } from "@tanstack/react-router";

import { logger } from "../../utils/logger";
import {
  authenticateRabbitHole,
  rabbitHoleJson,
  summarizeRabbitHoleDigest,
} from "../../utils/rabbit-hole-routes";

/**
 * Ends the session: stops the browser, freezes the deterministic digest and
 * optionally polishes it with the learner's model. The raw trail stays in
 * memory only until the wrap-up is discarded (or the purge timer fires).
 */
export const Route = createFileRoute("/api/rabbit-hole/$sessionId/end")({
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

        const digest = endRabbitHoleSession(params.sessionId);
        if (digest === null) {
          return rabbitHoleJson(
            { error: "The session could not be digested" },
            { status: 404 }
          );
        }

        let text = auth.session.enhancedDigest;
        if (text === null) {
          try {
            text = await summarizeRabbitHoleDigest({
              chatId: auth.session.chatId,
              deterministic: digest.digest,
              userId: auth.userId,
            });
          } catch (error: unknown) {
            logger.warn("Rabbit Hole digest enhancement failed", error);
            text = digest.digest;
          }
          auth.session.enhancedDigest = text;
        }

        return rabbitHoleJson({
          digest: text,
          pages: digest.pages,
          sourceDigest: digest.digest,
          stats: digest.stats,
          state: auth.session.browser.getState(),
          topic: digest.topic,
        });
      },
    },
  },
});
