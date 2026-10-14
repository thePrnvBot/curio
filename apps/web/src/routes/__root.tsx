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

import Header from "../components/header";
import { bindInteractionSounds } from "@/utils/sound";

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
});

const themeProviderProps: ThemeProviderProps = {
  attribute: "class",
  defaultTheme: "system",
  disableTransitionOnChange: true,
  enableSystem: true,
};

function RootDocument() {
  useEffect(() => {
    // Once for the document: delegated data-cuelume-* bindings + the saved
    // sound preference. Returns the unbind cleanup.
    return bindInteractionSounds();
  }, []);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider {...themeProviderProps}>
          <div className="grid h-svh grid-rows-[auto_1fr]">
            <Header />
            <main className="flex min-h-0 flex-col">
              <Outlet />
            </main>
          </div>
          <Toaster richColors />
          <TanStackRouterDevtools position="bottom-left" />
          <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
