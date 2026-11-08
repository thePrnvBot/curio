import type { Session } from "@curio/auth";
import { Option } from "effect";

import { auth } from "../services";

/**
 * One shared entry point for route handlers: resolves the better-auth
 * session of the incoming request as an Option, so no route re-duplicates
 * the 401 dance. Handlers fold `none` into {@link unauthorizedResponse}.
 */
export const requestSession = async (
  request: Request
): Promise<Option.Option<Session>> => {
  const session = await auth.api.getSession({ headers: request.headers });
  return Option.fromNullishOr(session);
};

/** The one 401 answer used whenever a route finds no session. */
export const unauthorizedResponse = (): Response =>
  Response.json({ error: "Authentication required" }, { status: 401 });
