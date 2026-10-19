import { initTRPC, TRPCError } from "@trpc/server";
import { Effect } from "effect";

import type { Context } from "../context";

/**
 * The ONE tRPC builder for the package — the package used to instantiate
 * this twice (root `index.ts` and `routers/index.ts`), relying on tRPC v11
 * structural compatibility to compile.
 */
export const t = initTRPC.context<Context>().create();

export const { router } = t;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
      cause: "No session",
    });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});

/** Fails the program with a 404 so the store's lookup failures surface as "not found" instead of generic 500. */
export const respondNotFound = (
  domainError: Error
): Effect.Effect<never, TRPCError> =>
  Effect.fail(
    new TRPCError({
      cause: domainError,
      code: "NOT_FOUND",
      message: domainError.message,
    })
  );

/** Fails the program with a 500 for domain failures clients cannot recover from. */
export const respondInternalError = (
  domainError: Error
): Effect.Effect<never, TRPCError> =>
  Effect.fail(
    new TRPCError({
      cause: domainError,
      code: "INTERNAL_SERVER_ERROR",
      message: domainError.message,
    })
  );
