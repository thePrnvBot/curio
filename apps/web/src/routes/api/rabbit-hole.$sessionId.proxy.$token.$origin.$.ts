import { proxyRabbitHoleRequest } from "@curio/api/infrastructure/rabbit-hole/proxy";
import { proxyBasePath } from "@curio/api/infrastructure/rabbit-hole/proxy-url";
import { getRabbitHoleSession } from "@curio/api/infrastructure/rabbit-hole/sessions";
import { createFileRoute } from "@tanstack/react-router";

/**
 * The actual browser surface.
 *
 * The overlay's iframe points here. The route keeps the target origin in a
 * path segment (`.../proxy/<token>/https%3A%2F%2Fexample.com/...`) so relative
 * assets and module imports resolve naturally, then streams the upstream
 * response back with framing headers stripped and a small tracker injected
 * into HTML.
 */
function handler({
  request,
  params,
}: {
  request: Request;
  params: {
    sessionId: string;
    token: string;
    origin: string;
    _splat: string;
  };
}) {
  const session = getRabbitHoleSession(params.sessionId);
  if (session === null) {
    return new Response("Rabbit Hole session not found", { status: 404 });
  }
  if (session.browser.proxyToken !== params.token) {
    return new Response("Rabbit Hole proxy link is not valid", { status: 403 });
  }

  const basePath = proxyBasePath(
    session.browser.id,
    session.browser.proxyToken
  );
  return proxyRabbitHoleRequest({
    basePath,
    origin: params.origin,
    parentOrigin: new URL(request.url).origin,
    request,
    session,
    splat: params._splat ?? "",
  });
}

export const Route = createFileRoute(
  "/api/rabbit-hole/$sessionId/proxy/$token/$origin/$"
)({
  server: {
    handlers: {
      DELETE: handler,
      GET: handler,
      HEAD: handler,
      OPTIONS: handler,
      PATCH: handler,
      POST: handler,
      PUT: handler,
    },
  },
});
