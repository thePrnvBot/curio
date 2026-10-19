import { Link } from "@tanstack/react-router";
import type {
  ErrorComponentProps,
  NotFoundRouteProps,
} from "@tanstack/react-router";

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
    <div className="bg-background flex min-h-dvh items-center justify-center px-6">
      <div className="border-border bg-card w-full max-w-md rounded-2xl border p-8 text-center shadow-sm">
        <p className="text-4xl">🧭</p>
        <h1 className="text-foreground mt-4 text-lg font-semibold">
          {props.heading}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {props.explanation}
        </p>
        <Link
          className="bg-primary text-primary-foreground hover:bg-primary/90 mt-6 inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-medium transition-colors"
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
  return (
    <FallbackCard
      explanation={
        props.error instanceof Error
          ? props.error.message.slice(0, 200)
          : "Something went wrong while rendering this page."
      }
      heading="Something broke"
    />
  );
}
