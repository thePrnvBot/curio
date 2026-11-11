import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  authenticateRabbitHole,
  rabbitHoleJson,
  readJsonBody,
} from "../../utils/rabbit-hole-routes";

const highlightSchema = z.object({
  quote: z.string().min(1).max(2000),
});

/**
 * Captures a passage the learner selected in the live page.
 *
 * The iframe is sandboxed and cross-origin, so the overlay asks the injected
 * tracker for `window.getSelection()` and posts the quote here. The server no
 * longer reads the DOM itself.
 */
export const Route = createFileRoute("/api/rabbit-hole/$sessionId/highlight")({
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
        const parsed = highlightSchema.safeParse(body.body);
        if (!parsed.success) {
          return rabbitHoleJson(
            { error: "Select some text in the page first." },
            { status: 422 }
          );
        }

        const quote = parsed.data.quote.replaceAll(/\s+/gu, " ").trim();
        if (quote === "") {
          return rabbitHoleJson(
            { error: "Select some text in the page first." },
            { status: 422 }
          );
        }
        const highlight = auth.session.browser.addHighlight(
          quote.slice(0, 2000)
        );
        return rabbitHoleJson({ highlight });
      },
    },
  },
});
