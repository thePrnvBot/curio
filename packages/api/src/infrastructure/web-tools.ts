import { tool } from "ai";
import type { ToolSet } from "ai";
import { Effect } from "effect";
import { z } from "zod";

import { webPageReadEffect, WEB_READ_TOOL_NAME } from "./web-reader";
import { duckDuckGoSearchEffect, WEB_SEARCH_TOOL_NAME } from "./web-search";

export {
  WEB_SEARCH_TOOL_NAME,
  type SearchFreshness,
  type WebSearchResult,
  type DuckDuckGoSearchOutcome,
  duckDuckGoSearch,
} from "./web-search";
export {
  WEB_READ_TOOL_NAME,
  type WebPageReadResult,
  readWebPage,
} from "./web-reader";

/* -------------------------------- AI tools -------------------------------- */

const OBSCURA_INSTALL_HINT =
  ". The Obscura binary is not installed; ask the operator to install it (https://docs.obscura.sh) or rely on search snippets only.";

/** DDG search + Obscura read pair for the Director. */
export function createWebTools(): ToolSet {
  return {
    [WEB_SEARCH_TOOL_NAME]: tool({
      description:
        "Search the public web with DuckDuckGo. Returns titles, urls and short snippets ordered by relevance. " +
        "Use it when up-to-date or external facts matter, then use web_read on the most promising urls.",
      execute: async ({ freshness = "any", limit = 5, query }) =>
        await Effect.runPromise(
          duckDuckGoSearchEffect(query, limit, freshness).pipe(
            Effect.catchTags({
              DdgBlocked: () =>
                Effect.succeed({
                  blocked: true,
                  note: "DuckDuckGo temporarily blocked the request. Answer from your own knowledge or try again shortly with a different phrasing.",
                  results: [],
                }),
              WebSearchFailed: (failure) =>
                Effect.succeed({
                  blocked: false,
                  error: failure.message,
                  results: [],
                }),
            })
          )
        ),
      inputSchema: z.object({
        freshness: z
          .enum(["any", "day", "week", "month", "year"])
          .optional()
          .describe(
            "Restrict to recently indexed pages; useful when researching version numbers, releases or news"
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(8)
          .optional()
          .describe("How many results to return (default 5)"),
        query: z
          .string()
          .min(1)
          .max(400)
          .describe("Web-search query, plain keywords work best"),
      }),
    }),
    [WEB_READ_TOOL_NAME]: tool({
      description:
        "Read a public web page and get its main content as clean markdown, rendered with a real browser engine (JavaScript included). " +
        "Use it on urls returned by web_search; never guess urls.",
      execute: async ({ selector, url }) =>
        await Effect.runPromise(
          webPageReadEffect(url, selector).pipe(
            Effect.catchTags({
              ObscuraUnavailable: (failure) =>
                Effect.succeed({
                  error: `${failure.message}${OBSCURA_INSTALL_HINT}`,
                  url,
                }),
              WebReadFailed: (failure) =>
                Effect.succeed({ error: failure.message, url }),
            })
          )
        ),
      inputSchema: z.object({
        selector: z
          .string()
          .max(200)
          .optional()
          .describe(
            "Optional CSS selector to narrow extraction to one region, e.g. 'main' or 'article'; skips nav, sidebars and footers"
          ),
        url: z.string().min(8).max(2000).describe("Page URL to read"),
      }),
    }),
  };
}
