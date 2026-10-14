import { Effect } from "effect";

export const WEB_SEARCH_TOOL_NAME = "web_search";

export type SearchFreshness = "any" | "day" | "week" | "month" | "year";

export class DdgBlocked extends Error {
  readonly _tag = "DdgBlocked";

  constructor(params: { query: string }) {
    super(`DuckDuckGo served an anti-bot page for "${params.query}"`);
    this.name = "DdgBlocked";
  }
}

export class WebSearchFailed extends Error {
  readonly _tag = "WebSearchFailed";

  constructor(params: { operation: string; cause: unknown }) {
    super(
      `Web search failed while ${params.operation}: ${describeCause(params.cause)}`
    );
    this.name = "WebSearchFailed";
  }
}

export interface WebSearchResult {
  readonly snippet: string;
  readonly title: string;
  readonly url: string;
}

export interface DuckDuckGoSearchOutcome {
  readonly blocked: boolean;
  readonly results: readonly WebSearchResult[];
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }
  return String(cause);
}

/* ------------------------------- DDG search ------------------------------- */

/**
 * Web search tier, modeled on Firecrawl's ddgsearch.ts
 * (apps/api/src/search/v2/ddgsearch.ts): hit the public DuckDuckGo HTML
 * endpoint, unwrap redirect links via `uddg=`, detect the anomaly modal,
 * and replay the "Next" form as a POST for extra pages. No API key;
 * unofficial, so pacing and a graceful blocked outcome matter.
 */

const DDG_HTML_URL = "https://html.duckduckgo.com/html";
const DDG_MAX_PAGES = 3;
const DDG_REQUEST_TIMEOUT_MS = 12_000;
const DDG_PAGE_DELAY: `${number} second` = "1 second";
const ANOMALY_MARK = "anomaly-modal__modal";

/** Familiar browser UAs, picked per request: DDG's anti-bot is UA-sensitive. */
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0",
];

const pickUserAgent = (): string =>
  USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] ??
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function decodeHtmlEntities(text: string): string {
  return text
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&");
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, "")).trim();
}

/** DDG wraps results in its own redirect; recover the destination URL. */
function ddgHrefToUrl(href: string): string | null {
  let candidate = decodeHtmlEntities(href.trim()).replace(/^\/\//, "https://");
  if (candidate.startsWith("/l/?")) {
    candidate = `https://duckduckgo.com${candidate}`;
  }
  if (candidate.includes("uddg=")) {
    try {
      const unwrapped = new URL(candidate).searchParams.get("uddg");
      if (unwrapped !== null && unwrapped !== "") {
        return unwrapped;
      }
    } catch {
      // Malformed redirect link: fall through to the direct-url test.
    }
  }
  return /^https?:\/\//i.test(candidate) ? candidate : null;
}

/**
 * Parse one results page. Each result owns a `.result__a` anchor followed by
 * its own title and snippet, so splitting on that anchor keeps title/snippet
 * pairs together even where plain index-zipping would drift.
 */
function parseDdgResults(html: string): readonly WebSearchResult[] {
  const resultChunks = html.split(/<a[^>]*class="result__a"/g).slice(1);
  const results: WebSearchResult[] = [];
  const seenUrls = new Set<string>();

  for (const chunk of resultChunks) {
    // The chunk starts with the anchor's remaining attributes, then
    // `>TITLE</a><snippet>...`; split attributes from markup at the first `>`.
    const attributesEnd = chunk.indexOf(">");
    if (attributesEnd === -1) {
      continue;
    }
    const url = ddgHrefToUrl(
      /href="([^"]*)"/.exec(chunk.slice(0, attributesEnd))?.[1] ?? ""
    );
    if (url === null || seenUrls.has(url)) {
      continue;
    }
    const anchorEnd = chunk.indexOf("</a>", attributesEnd);
    if (anchorEnd === -1) {
      continue;
    }
    const title = htmlToText(chunk.slice(attributesEnd + 1, anchorEnd));
    if (title === "") {
      continue;
    }
    seenUrls.add(url);
    const snippet = htmlToText(
      /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(chunk)?.[1] ?? ""
    );
    results.push({ snippet, title, url });
  }
  return results;
}

/** Collect the "Next" form fields so pagination can be replayed as a POST. */
function parseDdgNextPage(html: string): URLSearchParams | null {
  const formPattern =
    /<form[^>]*action="\/html\/"[^>]*method="POST"[^>]*>([\s\S]*?)<\/form>/g;
  for (const formMatch of html.matchAll(formPattern)) {
    const formData = formMatch[1] ?? "";
    if (!formData.includes("btn--alt")) {
      continue;
    }
    const nextPageParams = new URLSearchParams();
    for (const input of formData.matchAll(/<input[^>]*>/g)) {
      const name = /name="([^"]*)"/.exec(input[0])?.[1];
      const value = /value="([^"]*)"/.exec(input[0])?.[1];
      if (name !== undefined && name !== "" && value !== undefined) {
        nextPageParams.set(name, value);
      }
    }
    return nextPageParams;
  }
  return null;
}

const requestDdgPage = (
  params: URLSearchParams,
  usePost: boolean
): Effect.Effect<string, WebSearchFailed> =>
  Effect.tryPromise({
    async try() {
      const response = await fetch(
        usePost ? DDG_HTML_URL : `${DDG_HTML_URL}?${params.toString()}`,
        {
          headers: {
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "User-Agent": pickUserAgent(),
          },
          ...(usePost ? { body: params.toString(), method: "POST" } : {}),
          signal: AbortSignal.timeout(DDG_REQUEST_TIMEOUT_MS),
        }
      );
      if (!response.ok) {
        throw new Error(`DuckDuckGo responded ${response.status}`);
      }
      return response.text();
    },
    catch: (cause) =>
      new WebSearchFailed({ cause, operation: "request the results page" }),
  });

/** Search the public web: first page GETs up to `limit`, later pages POST the
 * replayed form one page at a time. Blocks surface as `DdgBlocked`. */
export const duckDuckGoSearchEffect = Effect.fnUntraced(function* (
  query: string,
  limit: number,
  freshness: SearchFreshness
): Effect.fn.Return<DuckDuckGoSearchOutcome, DdgBlocked | WebSearchFailed> {
  const dateFilter = freshness === "any" ? null : freshness.slice(0, 1);
  let nextPageParams: URLSearchParams | null = new URLSearchParams({
    kp: "1",
    q: query,
    ...(dateFilter === null ? {} : { df: dateFilter }),
  });
  let usePost = false;

  const results: WebSearchResult[] = [];
  const seenUrls = new Set<string>();

  for (let pageFetched = 0; pageFetched < DDG_MAX_PAGES; pageFetched += 1) {
    if (results.length >= limit || nextPageParams === null) {
      break;
    }
    if (pageFetched > 0) {
      usePost = true;
      yield* Effect.sleep(DDG_PAGE_DELAY);
    }
    const html = yield* requestDdgPage(nextPageParams, usePost);
    if (html.includes(ANOMALY_MARK)) {
      return yield* Effect.fail(new DdgBlocked({ query }));
    }
    for (const result of parseDdgResults(html)) {
      if (seenUrls.has(result.url)) {
        continue;
      }
      seenUrls.add(result.url);
      results.push(result);
    }
    nextPageParams = parseDdgNextPage(html);
  }

  return {
    blocked: false,
    results: results.slice(0, limit).map((result) => {
      const { snippet, title, url } = result;
      return { snippet, title, url };
    }),
  };
});

/** Promise-facing search helper for tools and tests: an anti-bot block is
 * surfaced in the outcome instead of failing the promise. */
export const duckDuckGoSearch = (
  query: string,
  limit: number,
  freshness: SearchFreshness = "any"
): Promise<DuckDuckGoSearchOutcome> =>
  Effect.runPromise(
    duckDuckGoSearchEffect(query, limit, freshness).pipe(
      Effect.catchTag("DdgBlocked", () =>
        Effect.succeed({ blocked: true, results: [] })
      )
    )
  );

