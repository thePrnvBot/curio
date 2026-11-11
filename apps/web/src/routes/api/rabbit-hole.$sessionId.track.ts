import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  authenticateRabbitHoleFast,
  rabbitHoleJson,
  readJsonBody,
} from "../../utils/rabbit-hole-routes";

const mediaSchema = z.object({
  kind: z.enum(["video", "audio", "embed"]),
  title: z.string().max(500).optional(),
  url: z.string().min(1).max(4000),
});

const trackSchema = z.object({
  kind: z.enum(["page", "activity"]),
  media: z.array(mediaSchema).max(20).optional(),
  scroll: z.number().finite().min(0).max(1).optional(),
  text: z.string().max(14_000).optional(),
  title: z.string().max(500).optional(),
  url: z.string().min(1).max(4000),
});

/**
 * Receives the tracker's page snapshots and activity heartbeats.
 *
 * The iframe is cross-origin by design, so the parent is the only component
 * that can talk to this authenticated route. Page text is capped to the same
 * 12k budget the old CDP capture used.
 */
export const Route = createFileRoute("/api/rabbit-hole/$sessionId/track")({
  server: {
    handlers: {
      POST: async ({
        request,
        params,
      }: {
        request: Request;
        params: { sessionId: string };
      }) => {
        const auth = await authenticateRabbitHoleFast(
          request,
          params.sessionId
        );
        if (!auth.ok) {
          return auth.response;
        }
        const body = await readJsonBody(request);
        if (!body.ok) {
          return body.response;
        }
        const parsed = trackSchema.safeParse(body.body);
        if (!parsed.success) {
          return rabbitHoleJson(
            { error: "Invalid tracker payload" },
            { status: 400 }
          );
        }

        const payload = parsed.data;
        auth.session.browser.recordPage({
          media: payload.media ?? [],
          scroll: payload.scroll ?? 0,
          text: payload.text ?? "",
          title: payload.title ?? "",
          url: payload.url,
        });
        return rabbitHoleJson({ ok: true });
      },
    },
  },
});
