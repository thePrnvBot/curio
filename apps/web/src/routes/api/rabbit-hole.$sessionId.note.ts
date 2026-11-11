import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { logger } from "../../utils/logger";
import {
  acknowledgeRabbitHoleNote,
  authenticateRabbitHole,
  rabbitHoleJson,
  readJsonBody,
} from "../../utils/rabbit-hole-routes";

const noteSchema = z.object({
  text: z.string().min(1).max(1000),
});

/**
 * Sidebar note: recorded against the page on screen, with a short Director
 * acknowledgement so the panel behaves like a conversation rather than a log.
 */
export const Route = createFileRoute("/api/rabbit-hole/$sessionId/note")({
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
        const body = await readJsonBody(request);
        if (!body.ok) {
          return body.response;
        }
        const parsed = noteSchema.safeParse(body.body);
        if (!parsed.success) {
          return rabbitHoleJson(
            { error: "Write a short note first" },
            { status: 400 }
          );
        }

        const { browser } = auth.session;
        const state = browser.getState();
        let reply: string;
        try {
          reply = await acknowledgeRabbitHoleNote({
            chatId: auth.session.chatId,
            excerpt: browser.currentPageExcerpt(),
            note: parsed.data.text.trim(),
            title: state.title,
            url: state.url,
            userId: auth.userId,
          });
        } catch (error: unknown) {
          logger.warn("Rabbit Hole note acknowledgement failed", error);
          reply =
            "Noted — I'll weigh that in the digest at the end of the session.";
        }

        const note = browser.addNote({
          reply,
          text: parsed.data.text.trim(),
        });
        return rabbitHoleJson({ note });
      },
    },
  },
});
