import { findActiveRabbitHoleForChat } from "@curio/api/infrastructure/rabbit-hole/sessions";
import { createFileRoute } from "@tanstack/react-router";
import { Option } from "effect";

import { requestSession, unauthorizedResponse } from "../../utils/api-session";
import { rabbitHoleJson } from "../../utils/rabbit-hole-routes";
import { withSecurityHeaders } from "../../utils/security-headers";

/**
 * Reattach hint: lets a reloaded chat reopen the Rabbit Hole that is still
 * running for it instead of leaving an orphaned browser invisible.
 */
export const Route = createFileRoute("/api/rabbit-hole/active")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const sessionOption = await requestSession(request);
        if (Option.isNone(sessionOption)) {
          return withSecurityHeaders(unauthorizedResponse());
        }
        const chatId = new URL(request.url).searchParams.get("chatId") ?? "";
        if (chatId === "") {
          return rabbitHoleJson({ sessionId: null });
        }
        const active = findActiveRabbitHoleForChat(
          chatId,
          sessionOption.value.user.id
        );
        return rabbitHoleJson({ sessionId: active?.browser.id ?? null });
      },
    },
  },
});
