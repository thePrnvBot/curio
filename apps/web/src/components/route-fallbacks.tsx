import { Link } from "@tanstack/react-router";
import type {
  ErrorComponentProps,
  NotFoundRouteProps,
} from "@tanstack/react-router";
import { CompassIcon } from "lucide-react";
import { useEffect } from "react";

import { logger } from "@/utils/logger";

/**
 * Route-level fallbacks: TanStack used to render an unstyled
 * `<div>Not Found</div>` and a raw stack-less error dump. Both now share one
 * styled card with a way back home.
 */

function FallbackCard(props: {
  readonly heading: string;
  readonly explanation: string;
}) {
  return (
    <div className="bg-background flex min-h-0 flex-1 items-center justify-center px-6 py-16">
      <div className="surface-card w-full max-w-sm p-8 text-center">
        <span className="bg-muted text-foreground mx-auto flex size-10 items-center justify-center rounded-full">
          <CompassIcon aria-hidden="true" className="size-5" />
        </span>
        <h1 className="mt-5 text-[18px] font-semibold tracking-[-0.02em]">
          {props.heading}
        </h1>
        <p className="text-muted-foreground mt-2 text-[13px] leading-6">
          {props.explanation}
        </p>
        <Link
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring mt-6 inline-flex h-8 items-center justify-center rounded-md px-3.5 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
          to="/"
        >
          Take me home
        </Link>
      </div>
    </div>
  );
}

/** Shown for any unmatched URL. */
export function RouteNotFoundComponent(props: NotFoundRouteProps) {
  return (
    <FallbackCard
      explanation={
        (typeof props.data === "string" && props.data) ||
        "The page you are looking for does not exist or has moved."
      }
      heading="Page not found"
    />
  );
}

/** Shown when a route render or loader throws. */
export function RouteErrorComponent(props: ErrorComponentProps) {
  useEffect(() => {
    logger.error("Route render failed", props.error);
  }, [props.error]);

  return (
    <FallbackCard
      explanation="Something went wrong while rendering this page. Try reloading it; if the problem persists, check the server logs."
      heading="Something broke"
    />
  );
}
