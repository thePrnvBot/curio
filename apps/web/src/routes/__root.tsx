import type { AppRouter } from "@curio/api/routers/index";
import { Toaster } from "@curio/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { ThemeProviderProps } from "next-themes";
import { ThemeProvider } from "next-themes";
import { useEffect } from "react";

import { bindInteractionSounds } from "@/utils/sound";

import Header from "../components/header";
import {
  RouteErrorComponent,
  RouteNotFoundComponent,
} from "../components/route-fallbacks";

import appCss from "../index.css?url";

export interface RouterAppContext {
  trpc: TRPCOptionsProxy<AppRouter>;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Curio",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),

  component: RootDocument,
  errorComponent: RouteErrorComponent,
  notFoundComponent: RouteNotFoundComponent,
});

const themeProviderProps: ThemeProviderProps = {
  attribute: "class",
  defaultTheme: "system",
  disableTransitionOnChange: true,
  enableSystem: true,
};

function RootDocument() {
  // Once for the document: delegated data-cue bindings + the saved sound
  // preference. bindInteractionSounds returns the unbind cleanup.
  useEffect(() => bindInteractionSounds(), []);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider {...themeProviderProps}>
          <div className="flex h-svh flex-col">
            {/* Floating nav dock: fixed, so the content column owns the
              full viewport height and clears the dock with pt-14. */}
            <Header />
            <main className="flex min-h-0 flex-1 flex-col pt-14">
              <Outlet />
            </main>
          </div>
          <Toaster richColors />
          {import.meta.env.DEV && (
            <>
              <TanStackRouterDevtools position="bottom-left" />
              <ReactQueryDevtools
                buttonPosition="bottom-right"
                position="bottom"
              />
            </>
          )}
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
