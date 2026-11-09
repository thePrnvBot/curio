import { createServerFn } from "@tanstack/react-start";

import { authMiddleware } from "@/middleware/auth";
import { toPublicSession } from "@/utils/public-session";

export const getUser = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(({ context }) => toPublicSession(context.session));
