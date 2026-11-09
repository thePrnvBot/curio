import { createFileRoute } from "@tanstack/react-router";
import { Option } from "effect";

import { curioRuntime } from "../../services";
import { requestSession, unauthorizedResponse } from "../../utils/api-session";
import { resumeChatStreamResponse } from "../../utils/durable-chat";
import { checkRateLimit, rateLimitResponse } from "../../utils/rate-limit";
import { withSecurityHeaders } from "../../utils/security-headers";

/**
 * Reconnect endpoint for the durable chat agent. The AI SDK transport calls
 * this when a chat is reopened and it must catch up: the server replays the
 * committed stream of an active run from storage, then tails it until the
 * run settles. 204 means there is nothing to catch up on.
 */
export const Route = createFileRoute("/api/chat/$chatId/stream")({
  server: {
    handlers: {
      GET: async ({
        request,
        params,
      }: {
        request: Request;
        params: { chatId: string };
      }) => {
        const sessionOption = await requestSession(request);
        if (Option.isNone(sessionOption)) {
          return withSecurityHeaders(unauthorizedResponse());
        }
        const session = sessionOption.value;

        const rateLimit = checkRateLimit(`stream:${session.user.id}`, {
          limit: 20,
          windowMs: 60_000,
        });
        if (!rateLimit.allowed) {
          return withSecurityHeaders(rateLimitResponse(rateLimit.headers));
        }

        return await curioRuntime.runPromise(
          resumeChatStreamResponse({
            chatId: params.chatId,
            userId: session.user.id,
          })
        );
      },
    },
  },
});
