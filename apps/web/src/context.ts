import type { Context as ApiContext } from "@curio/api/context";

import { db, auth } from "./services";

export async function createContext({
  req,
}: {
  req: Request;
}): Promise<ApiContext> {
  const session = await auth.api.getSession({
    headers: req.headers,
  });
  return {
    db,
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
