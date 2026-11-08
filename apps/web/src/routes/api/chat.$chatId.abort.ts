import { createFileRoute } from "@tanstack/react-router";
import { Option } from "effect";

import { curioRuntime } from "../../services";
import { requestSession, unauthorizedResponse } from "../../utils/api-session";
import { abortChatRunResponse } from "../../utils/durable-chat";
import { withSecurityHeaders } from "../../utils/security-headers";

/**
 * Stop button for a detached agent run. Aborting the POST /api/chat fetch
 * only detaches the live viewer; this route is what actually stops the
 * server-side generation through the run's AbortController (which also
 * triggers the partial-message persistence on abort).
 */
export const Route = createFileRoute("/api/chat/$chatId/abort")({
  server: {
    handlers: {
      POST: async ({
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

        return await curioRuntime.runPromise(
          abortChatRunResponse({
            chatId: params.chatId,
            userId: session.user.id,
          })
        );
      },
    },
  },
});
