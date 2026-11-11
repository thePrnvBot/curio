import { createHash } from "node:crypto";

import { parse, serialize } from "parse5";
import type { DefaultTreeAdapterTypes } from "parse5";

import {
  buildProxyUrl,
  decodeProxyTarget,
  toProxyUrl,
  targetFromProxyUrl,
} from "./proxy-url";
import type { StoredRabbitHoleSession } from "./sessions";
import { buildTrackerScript } from "./tracker";
import type { RabbitHoleMedia } from "./types";

type Document = DefaultTreeAdapterTypes.Document;
type Element = DefaultTreeAdapterTypes.Element;
type ParentNode = DefaultTreeAdapterTypes.ParentNode;
type TextNode = DefaultTreeAdapterTypes.TextNode;
type ChildNode = DefaultTreeAdapterTypes.ChildNode;

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_INLINE_BODY_BYTES = 4_000_000;
const PAGE_TEXT_LIMIT = 12_000;

const REMOVE_ATTRS = new Set(["integrity"]);
const REWRITE_ATTRS = new Set([
  "action",
  "background",
  "cite",
  "data",
  "formaction",
  "href",
  "longdesc",
  "manifest",
  "poster",
  "src",
  "xlink:href",
]);
const ATTRIBUTE_NAMES = [
  ...REWRITE_ATTRS,
  "content",
  "imagesrcset",
  "srcset",
  "style",
] as const;

function isElement(node: ChildNode | ParentNode): node is Element {
  return "tagName" in node;
}

function isTextNode(node: ChildNode | ParentNode): node is TextNode {
  return node.nodeName === "#text";
}

function attr(element: Element, name: string): string | null {
  const found = element.attrs.find(
    (entry) => entry.name.toLowerCase() === name.toLowerCase()
  );
  return found === undefined ? null : found.value;
}

function setAttr(element: Element, name: string, value: string): void {
  const found = element.attrs.find(
    (entry) => entry.name.toLowerCase() === name.toLowerCase()
  );
  if (found === undefined) {
    element.attrs.push({ name, value });
    return;
  }
  found.value = value;
}

function removeAttr(element: Element, name: string): void {
  element.attrs = element.attrs.filter(
    (entry) => entry.name.toLowerCase() !== name.toLowerCase()
  );
}

function detach(node: ChildNode): void {
  const parent = node.parentNode;
  if (parent === null) {
    return;
  }
  const index = parent.childNodes.indexOf(node);
  if (index !== -1) {
    parent.childNodes.splice(index, 1);
  }
}

function walk(
  node: ParentNode | ChildNode,
  visit: (node: ChildNode) => void
): void {
  if (!("childNodes" in node)) {
    return;
  }
  for (const child of node.childNodes) {
    visit(child);
    if ("childNodes" in child) {
      walk(child, visit);
    }
    if (
      isElement(child) &&
      child.tagName === "template" &&
      "content" in child
    ) {
      const template = child as DefaultTreeAdapterTypes.Template;
      walk(template.content, visit);
    }
  }
}

function rewriteSrcset(
  value: string,
  targetUrl: string,
  basePath: string
): string {
  if (value.toLowerCase().includes("data:")) {
    return value;
  }
  let changed = false;
  const rewritten = value
    .split(",")
    .map((candidate) => {
      const trimmed = candidate.trim();
      if (trimmed === "") {
        return candidate;
      }
      const match = trimmed.match(/^(?<url>\S+)(?<descriptor>\s+.+)?$/u);
      if (match?.groups === undefined) {
        return candidate;
      }
      const proxied = toProxyUrl(match.groups.url ?? "", targetUrl, basePath);
      if (proxied === null || proxied === match.groups.url) {
        return candidate;
      }
      changed = true;
      return `${proxied}${match.groups.descriptor ?? ""}`;
    })
    .join(", ");
  return changed ? rewritten : value;
}

/** Rewrites `url(...)` and `@import "..."` references in a stylesheet. */
export function rewriteCssUrls(
  css: string,
  cssUrl: string,
  basePath: string
): string {
  const withUrls = css.replaceAll(
    /url\(\s*(?<quote>['"]?)(?<value>[^'")]+)\k<quote>\s*\)/giu,
    (match, quote: string, value: string) => {
      const proxied = toProxyUrl(value, cssUrl, basePath);
      if (proxied === null) {
        return match;
      }
      return `url(${quote}${proxied}${quote})`;
    }
  );
  return withUrls.replaceAll(
    /@import\s+(?<quote>['"])(?<value>[^'"]+)\k<quote>/giu,
    (match, quote: string, value: string) => {
      const proxied = toProxyUrl(value, cssUrl, basePath);
      if (proxied === null) {
        return match;
      }
      return `@import ${quote}${proxied}${quote}`;
    }
  );
}

function rewriteMetaRefresh(
  content: string,
  targetUrl: string,
  basePath: string
): string {
  return content.replaceAll(
    /(?<prefix>url\s*=\s*['"]?)(?<value>[^'";]+)(?<suffix>['"]?)/giu,
    (match, prefix: string, value: string, suffix: string) => {
      const proxied = toProxyUrl(value, targetUrl, basePath);
      return proxied === null ? match : `${prefix}${proxied}${suffix}`;
    }
  );
}

// oxlint-disable-next-line complexity -- one attribute table is clearer than a dozen tiny visitors
function rewriteElement(
  element: Element,
  targetUrl: string,
  basePath: string,
  removals: Set<Element>
): void {
  const tag = element.tagName.toLowerCase();

  if (tag === "base") {
    removals.add(element);
    return;
  }

  const httpEquiv = attr(element, "http-equiv")?.toLowerCase();
  if (tag === "meta" && httpEquiv === "content-security-policy") {
    removals.add(element);
    return;
  }

  for (const name of REMOVE_ATTRS) {
    if (attr(element, name) !== null) {
      removeAttr(element, name);
    }
  }

  for (const name of ATTRIBUTE_NAMES) {
    const value = attr(element, name);
    if (value === null) {
      continue;
    }
    if (name === "style") {
      const rewritten = rewriteCssUrls(value, targetUrl, basePath);
      if (rewritten !== value) {
        setAttr(element, name, rewritten);
      }
      continue;
    }
    if (name === "srcset" || name === "imagesrcset") {
      const rewritten = rewriteSrcset(value, targetUrl, basePath);
      if (rewritten !== value) {
        setAttr(element, name, rewritten);
      }
      continue;
    }
    if (name === "content" && tag === "meta" && httpEquiv === "refresh") {
      const rewritten = rewriteMetaRefresh(value, targetUrl, basePath);
      if (rewritten !== value) {
        setAttr(element, name, rewritten);
      }
      continue;
    }
    if (!REWRITE_ATTRS.has(name)) {
      continue;
    }
    const proxied = toProxyUrl(value, targetUrl, basePath);
    if (proxied !== null && proxied !== value) {
      setAttr(element, name, proxied);
    }
  }

  if (
    (tag === "a" || tag === "form") &&
    ["_blank", "_parent", "_top"].includes(attr(element, "target") ?? "")
  ) {
    setAttr(element, "target", "_self");
  }

  if (tag === "style") {
    const text = element.childNodes.find(isTextNode);
    if (text !== undefined) {
      text.value = rewriteCssUrls(text.value, targetUrl, basePath);
    }
  }
}

function injectTracker(html: string, trackerTag: string): string {
  if (/<head(?:\s[^>]*)?>/iu.test(html)) {
    return html.replace(
      /<head(?:\s[^>]*)?>/iu,
      (match) => `${match}${trackerTag}`
    );
  }
  if (/<html(?:\s[^>]*)?>/iu.test(html)) {
    return html.replace(
      /<html(?:\s[^>]*)?>/iu,
      (match) => `${match}<head>${trackerTag}</head>`
    );
  }
  return `${trackerTag}${html}`;
}

function escapeScript(script: string): string {
  return script.replaceAll(/<\/script/giu, "<\\/script");
}

function resolveMediaUrl(raw: string, targetUrl: string): string {
  if (raw === "") {
    return raw;
  }
  try {
    return new URL(raw, targetUrl).href;
  } catch {
    return raw;
  }
}

// oxlint-disable-next-line complexity -- the traversal handles text, title and three media shapes together
function collectPageDetails(
  document: Document,
  targetUrl: string
): {
  readonly media: readonly RabbitHoleMedia[];
  readonly text: string;
  readonly title: string;
} {
  let title = "";
  const textParts: string[] = [];
  const media: RabbitHoleMedia[] = [];
  const seenMedia = new Set<string>();

  const addMedia = (
    url: string,
    kind: RabbitHoleMedia["kind"],
    label?: string
  ) => {
    const normalizedUrl = url.slice(0, 4000);
    if (normalizedUrl === "" || seenMedia.has(normalizedUrl)) {
      return;
    }
    seenMedia.add(normalizedUrl);
    const cleanLabel = label?.replaceAll(/\s+/gu, " ").trim().slice(0, 500);
    media.push(
      cleanLabel === undefined || cleanLabel === ""
        ? { kind, url: normalizedUrl }
        : { kind, title: cleanLabel, url: normalizedUrl }
    );
  };

  // oxlint-disable-next-line complexity -- text, title and media extraction share one DOM walk
  const visit = (node: ChildNode): void => {
    if (isTextNode(node)) {
      const parent = node.parentNode;
      if (parent !== null && isElement(parent)) {
        const tag = parent.tagName.toLowerCase();
        if (tag === "script" || tag === "style" || tag === "noscript") {
          return;
        }
      }
      const value = node.value.replaceAll(/\s+/gu, " ").trim();
      if (value !== "") {
        textParts.push(value);
      }
      return;
    }
    if (!isElement(node)) {
      return;
    }
    const tag = node.tagName.toLowerCase();
    if (tag === "title" && title === "") {
      const text = node.childNodes.find(isTextNode);
      title = text === undefined ? "" : text.value.trim().slice(0, 500);
    }
    if (tag === "video" || tag === "audio") {
      const src = resolveMediaUrl(attr(node, "src") ?? "", targetUrl);
      if (src !== "") {
        addMedia(
          src,
          tag === "video" ? "video" : "audio",
          attr(node, "title") ?? attr(node, "aria-label") ?? undefined
        );
      }
    }
    if (tag === "iframe") {
      const src = resolveMediaUrl(attr(node, "src") ?? "", targetUrl);
      if (src !== "" && !/^(?:about|javascript):/iu.test(src)) {
        const match = src.match(
          /(?:youtube\.com\/embed\/|youtu\.be\/|youtube\.com\/watch\?v=)(?<id>[A-Za-z0-9_-]{6,})/u
        );
        addMedia(
          match?.groups?.id === undefined
            ? src
            : `https://www.youtube.com/watch?v=${match.groups.id}`,
          match === null ? "embed" : "video",
          attr(node, "title") ?? undefined
        );
      }
    }
  };

  walk(document, visit);

  return {
    media: media.slice(0, 20),
    text: textParts
      .join(" ")
      .replaceAll(/\s+/gu, " ")
      .trim()
      .slice(0, PAGE_TEXT_LIMIT),
    title,
  };
}

export interface RewriteHtmlOptions {
  readonly basePath: string;
  readonly parentOrigin: string;
  readonly sessionId: string;
  readonly targetUrl: string;
  readonly token: string;
}

/** Rewrites one HTML document and injects the tracker script. */
export function rewriteHtml(
  html: string,
  options: RewriteHtmlOptions
): {
  readonly html: string;
  readonly media: readonly RabbitHoleMedia[];
  readonly text: string;
  readonly title: string;
} {
  const document = parse(html);
  // Read media URLs before rewriting: after the pass they point at the proxy,
  // which is ephemeral and useless in the digest.
  const details = collectPageDetails(document, options.targetUrl);
  const removals = new Set<Element>();
  walk(document, (node) => {
    if (isElement(node)) {
      rewriteElement(node, options.targetUrl, options.basePath, removals);
    }
  });
  for (const node of removals) {
    detach(node);
  }
  const trackerTag = `<script data-curio-tracker>${escapeScript(
    buildTrackerScript({
      parentOrigin: options.parentOrigin,
      proxyBasePath: options.basePath,
      sessionId: options.sessionId,
      targetUrl: options.targetUrl,
      token: options.token,
    })
  )}</script>`;
  return {
    html: injectTracker(serialize(document), trackerTag),
    media: details.media,
    text: details.text,
    title: details.title,
  };
}

function cookiePrefix(origin: string): string {
  const hash = createHash("sha1").update(origin).digest("hex").slice(0, 12);
  return `__curio_rh_${hash}_`;
}

function parseCookiePairs(header: string): { name: string; value: string }[] {
  const pairs: { name: string; value: string }[] = [];
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    pairs.push({
      name: trimmed.slice(0, separator).trim(),
      value: trimmed.slice(separator + 1),
    });
  }
  return pairs;
}

function forwardedCookieHeader(
  request: Request,
  origin: string
): string | null {
  const header = request.headers.get("cookie");
  if (header === null) {
    return null;
  }
  const prefix = cookiePrefix(origin);
  const forwarded = parseCookiePairs(header)
    .filter((pair) => pair.name.startsWith(prefix))
    .map((pair) => `${pair.name.slice(prefix.length)}=${pair.value}`);
  return forwarded.length === 0 ? null : forwarded.join("; ");
}

function rewriteSetCookie(
  cookie: string,
  options: {
    readonly basePath: string;
    readonly origin: string;
    readonly secure: boolean;
  }
): string {
  const [pair, ...attributes] = cookie.split(";");
  const separator = (pair ?? "").indexOf("=");
  const name =
    separator <= 0
      ? (pair ?? "").trim()
      : (pair ?? "").slice(0, separator).trim();
  const value = separator <= 0 ? "" : (pair ?? "").slice(separator + 1);
  const prefix = cookiePrefix(options.origin);
  const namespaced = name.startsWith(prefix) ? name : `${prefix}${name}`;
  // Scope to the proxy, not the encoded origin segment: the request-side
  // filter already drops cookies whose per-origin prefix does not match.
  const path = options.basePath;
  const output = [`${namespaced}=${value}`];
  let sameSiteSeen = false;

  for (const attribute of attributes) {
    const trimmed = attribute.trim();
    if (trimmed === "") {
      continue;
    }
    const lower = trimmed.toLowerCase();
    if (lower.startsWith("domain=") || lower === "partitioned") {
      continue;
    }
    if (lower.startsWith("path=")) {
      continue;
    }
    if (lower === "secure") {
      if (options.secure) {
        output.push(trimmed);
      }
      continue;
    }
    if (lower.startsWith("samesite=")) {
      sameSiteSeen = true;
      output.push("SameSite=Lax");
      continue;
    }
    output.push(trimmed);
  }
  if (!sameSiteSeen) {
    output.push("SameSite=Lax");
  }
  output.push(`Path=${path}`);
  return output.join("; ");
}

function upstreamCookieHeader(request: Request, target: URL): string | null {
  return forwardedCookieHeader(request, target.origin);
}

function upstreamReferer(
  request: Request,
  target: URL,
  basePath: string
): string {
  const referer = request.headers.get("referer");
  if (referer !== null) {
    const recovered = targetFromProxyUrl(referer, basePath);
    if (recovered !== null) {
      return recovered;
    }
  }
  return target.href;
}

function buildUpstreamHeaders(
  request: Request,
  target: URL,
  basePath: string
): Headers {
  const headers = new Headers();
  for (const name of [
    "accept",
    "accept-language",
    "content-type",
    "if-none-match",
    "if-modified-since",
    "if-range",
    "range",
    "user-agent",
  ]) {
    const value = request.headers.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }
  headers.set("accept-encoding", "identity");
  const cookie = upstreamCookieHeader(request, target);
  if (cookie !== null) {
    headers.set("cookie", cookie);
  }
  headers.set("referer", upstreamReferer(request, target, basePath));
  if (request.method !== "GET" && request.method !== "HEAD") {
    headers.set("origin", target.origin);
  }
  return headers;
}

function safeResponseHeaders(
  upstream: Response,
  options: {
    readonly basePath: string;
    readonly origin: string;
    readonly request: Request;
    readonly secure: boolean;
    readonly targetUrl: string;
  }
): Headers {
  const headers = new Headers();
  for (const name of [
    "accept-ranges",
    "cache-control",
    "content-disposition",
    "content-language",
    "content-range",
    "content-type",
    "vary",
  ]) {
    const value = upstream.headers.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }
  const refresh = upstream.headers.get("refresh");
  if (refresh !== null) {
    headers.set(
      "refresh",
      rewriteMetaRefresh(refresh, options.targetUrl, options.basePath)
    );
  }
  if (headers.get("cache-control") === null) {
    headers.set("cache-control", "no-store");
  }

  const cookieSource = upstream.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const cookies =
    typeof cookieSource.getSetCookie === "function"
      ? cookieSource.getSetCookie()
      : (upstream.headers.get("set-cookie") ?? "")
          .split(/,(?=\s*[^;,=\s]+=)/u)
          .map((cookie) => cookie.trim())
          .filter((cookie) => cookie !== "");
  for (const cookie of cookies) {
    headers.append(
      "set-cookie",
      rewriteSetCookie(cookie, {
        basePath: options.basePath,
        origin: options.origin,
        secure: options.secure,
      })
    );
  }

  const requestOrigin = options.request.headers.get("origin");
  headers.set("access-control-allow-origin", requestOrigin ?? "*");
  headers.set("access-control-allow-credentials", "true");
  headers.set("access-control-expose-headers", "*");
  // Keep the browser's Referer inside the proxy origin so the route can
  // recover the real page for the upstream request. The token never reaches
  // the target because the proxy rewrites the header.
  headers.set("referrer-policy", "same-origin");
  headers.set("vary", "Origin");
  return headers;
}

function corsPreflight(request: Request): Response {
  const headers = new Headers();
  headers.set(
    "access-control-allow-origin",
    request.headers.get("origin") ?? "*"
  );
  headers.set("access-control-allow-credentials", "true");
  headers.set(
    "access-control-allow-headers",
    request.headers.get("access-control-request-headers") ?? "*"
  );
  headers.set(
    "access-control-allow-methods",
    "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  headers.set("access-control-max-age", "600");
  headers.set("vary", "Origin");
  return new Response(null, { headers, status: 204 });
}

function errorPage(message: string, status: number): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Rabbit Hole</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0d;color:#e8e8ea;font:14px/1.6 system-ui,sans-serif}main{max-width:32rem;padding:2rem;text-align:center}h1{font-size:1rem;margin:0 0 .5rem}p{color:#a5a5ad;margin:0}</style></head><body><main><h1>This page could not be opened</h1><p>${message
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")}</p></main></body></html>`;
  return new Response(html, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
    status,
  });
}

function isTopLevelDocument(request: Request, basePath: string): boolean {
  if (request.method !== "GET") {
    return false;
  }
  const destination = request.headers.get("sec-fetch-dest");
  if (destination !== "iframe" && destination !== "document") {
    return false;
  }
  // A referer that is itself a proxy URL means this is a nested iframe inside
  // the proxied page (an ad, widget, embed), not the learner's main frame.
  const referer = request.headers.get("referer");
  if (referer !== null && targetFromProxyUrl(referer, basePath) !== null) {
    return false;
  }
  return true;
}

function charsetFromContentType(contentType: string): string {
  const match = /charset=(?<charset>[^;]+)/iu.exec(contentType);
  return match?.groups?.charset?.trim().replaceAll(/["']/gu, "") ?? "utf-8";
}

function decodeBody(buffer: ArrayBuffer, contentType: string): string {
  try {
    return new TextDecoder(charsetFromContentType(contentType)).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

/**
 * Proxies one request for the Rabbit Hole iframe.
 *
 * The caller has already validated the session token. This function owns the
 * upstream fetch, cookie isolation, header stripping, HTML/CSS rewriting and
 * top-level page capture.
 */
// oxlint-disable-next-line complexity -- this is the single proxy boundary for every HTTP shape
export async function proxyRabbitHoleRequest({
  basePath,
  origin,
  parentOrigin,
  request,
  session,
  splat,
}: {
  readonly basePath: string;
  readonly origin: string;
  readonly parentOrigin: string;
  readonly request: Request;
  readonly session: StoredRabbitHoleSession;
  readonly splat: string;
}): Promise<Response> {
  if (request.method === "OPTIONS") {
    return corsPreflight(request);
  }

  const requestUrl = new URL(request.url);
  const target = decodeProxyTarget(origin, splat, requestUrl.search);
  if (target === null) {
    return errorPage("That address is not a web page.", 400);
  }
  if (target.origin === parentOrigin) {
    return errorPage("Rabbit Hole cannot proxy its own app origin.", 400);
  }

  const secure = requestUrl.protocol === "https:";
  const headers = buildUpstreamHeaders(request, target, basePath);

  let body: ArrayBuffer | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_INLINE_BODY_BYTES
    ) {
      return errorPage("That request body is too large to proxy.", 413);
    }
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength > MAX_INLINE_BODY_BYTES) {
      return errorPage("That request body is too large to proxy.", 413);
    }
    if (buffer.byteLength > 0) {
      body = buffer;
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.href, {
      body,
      headers,
      method: request.method,
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "The site did not respond.";
    return errorPage(message, 502);
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    const location = upstream.headers.get("location");
    if (location !== null) {
      let next: URL;
      try {
        next = new URL(location, target);
      } catch {
        return errorPage("The site sent an invalid redirect.", 502);
      }
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        return errorPage("The site redirected to an unsupported address.", 502);
      }
      const responseHeaders = safeResponseHeaders(upstream, {
        basePath,
        origin: target.origin,
        request,
        secure,
        targetUrl: target.href,
      });
      responseHeaders.set("location", buildProxyUrl(basePath, next.href));
      return new Response(null, {
        headers: responseHeaders,
        status: upstream.status,
      });
    }
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  const responseHeaders = safeResponseHeaders(upstream, {
    basePath,
    origin: target.origin,
    request,
    secure,
    targetUrl: target.href,
  });

  if (upstream.status === 204 || upstream.status === 304) {
    return new Response(null, {
      headers: responseHeaders,
      status: upstream.status,
    });
  }

  if (contentType.toLowerCase().includes("text/html")) {
    const buffer = await upstream.arrayBuffer();
    const decoded = decodeBody(buffer, contentType);
    const rewritten = rewriteHtml(decoded, {
      basePath,
      parentOrigin,
      sessionId: session.browser.id,
      targetUrl: target.href,
      token: session.browser.proxyToken,
    });
    if (upstream.status < 400 && isTopLevelDocument(request, basePath)) {
      session.browser.recordPage({
        media: rewritten.media,
        scroll: 0,
        text: rewritten.text,
        title: rewritten.title,
        url: target.href,
      });
    }
    responseHeaders.set("cache-control", "no-store");
    responseHeaders.set("content-type", "text/html; charset=utf-8");
    return new Response(rewritten.html, {
      headers: responseHeaders,
      status: upstream.status,
    });
  }

  if (contentType.toLowerCase().includes("text/css")) {
    const buffer = await upstream.arrayBuffer();
    const css = decodeBody(buffer, contentType);
    responseHeaders.set("cache-control", "no-store");
    responseHeaders.set("content-type", "text/css; charset=utf-8");
    return new Response(rewriteCssUrls(css, target.href, basePath), {
      headers: responseHeaders,
      status: upstream.status,
    });
  }

  return new Response(upstream.body, {
    headers: responseHeaders,
    status: upstream.status,
  });
}
