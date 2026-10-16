import { createFileRoute } from "@tanstack/react-router";

import { auth, curioRuntime } from "../../services";
import { resumeChatStreamResponse } from "../../utils/durable-chat";

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
        const session = await auth.api.getSession({ headers: request.headers });

        if (!session) {
          return Response.json(
            { error: "Authentication required" },
            { status: 401 }
          );
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
