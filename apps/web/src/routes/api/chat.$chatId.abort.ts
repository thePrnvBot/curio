import { createFileRoute } from "@tanstack/react-router";

import { auth, curioRuntime } from "../../services";
import { abortChatRunResponse } from "../../utils/durable-chat";

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
        const session = await auth.api.getSession({ headers: request.headers });

        if (!session) {
          return Response.json(
            { error: "Authentication required" },
            { status: 401 }
          );
        }

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
