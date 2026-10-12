import { createAppRouter } from "@curio/api/routers/index";
import { createFileRoute } from "@tanstack/react-router";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { createContext } from "../../../context";
import { curioRuntime } from "../../../services";

function handler({ request }: { request: Request }) {
  return fetchRequestHandler({
    req: request,
    router: createAppRouter(curioRuntime),
    createContext,
    endpoint: "/api/trpc",
  });
}

export const Route = createFileRoute("/api/trpc/$")({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
});
