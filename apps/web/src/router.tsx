import type { AppRouter } from "@curio/api/routers/index";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "sonner";

import Loader from "./components/loader";
import {
  RouteErrorComponent,
  RouteNotFoundComponent,
} from "./components/route-fallbacks";
import { routeTree } from "./routeTree.gen";
import { TRPCProvider } from "./utils/trpc";

function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        toast.error(error.message, {
          action: {
            label: "retry",
            onClick: () => {
              query.invalidate();
            },
          },
        });
      },
    }),
    defaultOptions: { queries: { staleTime: 60 * 1000 } },
  });
}

/**
 * During SSR, tRPC's relative `/api/trpc` URL is not a valid fetch input for
 * Node's `fetch` (it needs an absolute URL) and Node has no cookie jar. The
 * browser handles both itself, so only the server path borrows the origin and
 * authentication headers of the incoming request.
 *
 * The implementation lives behind `createIsomorphicFn` so the Start compiler
 * can drop the server-only import from the client bundle.
 */
const serverRequestContext = createIsomorphicFn()
  .server(async (relativeUrl: string) => {
    const { getRequestHeaders, getRequestUrl } =
      await import("@tanstack/react-start/server");
    const requestHeaders = getRequestHeaders();
    const forwardedHeaders = new Headers();
    for (const name of ["cookie", "authorization"] as const) {
      const value = requestHeaders.get(name);
      if (value !== null) {
        forwardedHeaders.set(name, value);
      }
    }
    return {
      headers: forwardedHeaders,
      url: new URL(relativeUrl, getRequestUrl()).toString(),
    };
  })
  .client((_relativeUrl: string) => null);

async function serverFetch(
  input: RequestInfo | URL | string,
  init?: RequestInit
): Promise<Response> {
  if (typeof window !== "undefined") {
    return fetch(input, { ...init, credentials: "include" });
  }

  if (typeof input !== "string" || !input.startsWith("/")) {
    return fetch(input, { ...init, credentials: "include" });
  }

  const serverContext = await serverRequestContext(input);
  if (serverContext === null) {
    return fetch(input, { ...init, credentials: "include" });
  }

  const headers = new Headers(init?.headers);
  for (const [name, value] of serverContext.headers) {
    headers.set(name, value);
  }
  return fetch(serverContext.url, {
    ...init,
    credentials: "include",
    headers,
  });
}

const trpcClient = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: "/api/trpc", fetch: serverFetch })],
});
export const getRouter = () => {
  const queryClient = createQueryClient();
  const trpc = createTRPCOptionsProxy({
    client: trpcClient,
    queryClient,
  });

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    // Hovering any Link preloads the destination route (loaders + query
    // prefetched through the SSR query integration) so navigation feels
    // instant; staleTime 0 keeps the prefetched data from being reused
    // stale on real navigation.
    defaultPreload: "intent",
    defaultPreloadDelay: 80,
    defaultPreloadStaleTime: 0,
    context: { trpc, queryClient },
    defaultPendingComponent: () => <Loader />,
    defaultErrorComponent: RouteErrorComponent,
    defaultNotFoundComponent: RouteNotFoundComponent,
    Wrap: ({ children }) => (
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    ),
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  });

  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
