/**
 * Pure URL helpers shared by the proxy route and the overlay.
 *
 * A proxied page keeps its own path structure:
 *
 *   /api/rabbit-hole/<session>/proxy/<token>/https%3A%2F%2Fexample.com/foo/bar
 *
 * Keeping the target origin in a path segment means relative asset and module
 * URLs (`./chunk.js`, `../img.png`) resolve through the same proxy without any
 * JavaScript rewriting. Absolute and root-relative URLs still have to be
 * rewritten, which the server does for HTML/CSS and the injected tracker does
 * for the live DOM.
 */

const NOT_PROXYABLE =
  /^(?:about|blob|data|file|javascript|mailto|tel|ws|wss):/iu;

export function proxyBasePath(sessionId: string, token: string): string {
  return `/api/rabbit-hole/${encodeURIComponent(sessionId)}/proxy/${encodeURIComponent(token)}`;
}

/** Builds the proxy URL for a fully-qualified http(s) target. */
export function buildProxyUrl(basePath: string, target: string): string {
  const url = new URL(target);
  return `${basePath}/${encodeURIComponent(url.origin)}${url.pathname}${url.search}${url.hash}`;
}

/**
 * Rewrites one URL found in HTML, CSS or the live DOM.
 *
 * Returns `null` when the value is not something the proxy should touch
 * (`data:`, `mailto:`, `javascript:`, …). A same-document fragment stays a
 * fragment so in-page anchors keep working.
 */
export function toProxyUrl(
  rawValue: string,
  targetUrl: string,
  basePath: string
): string | null {
  const value = rawValue.trim();
  if (value === "") {
    return null;
  }
  if (value.startsWith("#")) {
    return value;
  }
  if (value.startsWith(`${basePath}/`)) {
    return value;
  }
  if (NOT_PROXYABLE.test(value)) {
    return null;
  }

  let resolved: URL;
  let base: URL;
  try {
    base = new URL(targetUrl);
    resolved = new URL(value, base);
  } catch {
    return null;
  }
  if (resolved.pathname.startsWith(`${basePath}/`)) {
    return value;
  }
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    return null;
  }

  if (
    resolved.origin === base.origin &&
    resolved.pathname === base.pathname &&
    resolved.search === base.search &&
    resolved.hash !== ""
  ) {
    return resolved.hash;
  }

  return `${basePath}/${encodeURIComponent(resolved.origin)}${resolved.pathname}${resolved.search}${resolved.hash}`;
}

/**
 * Reconstructs the upstream target from the proxy route params.
 *
 * `origin` and `splat` arrive decoded from the router, while `search` is the
 * original query string (including the leading `?`).
 */
export function decodeProxyTarget(
  origin: string,
  splat: string,
  search: string
): URL | null {
  if (!/^https?:\/\//iu.test(origin)) {
    return null;
  }
  const path = splat === "" ? "/" : `/${splat.replace(/^\/+/u, "")}`;
  let target: URL;
  try {
    target = new URL(`${path}${search}`, origin);
  } catch {
    return null;
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return null;
  }
  if (target.origin !== new URL(origin).origin) {
    return null;
  }
  return target;
}

/**
 * Recovers the upstream URL from a proxy URL, used for the upstream `Referer`
 * header. Returns `null` when the URL is not one of ours.
 */
export function targetFromProxyUrl(
  value: string,
  basePath: string
): string | null {
  let parsed: URL;
  try {
    // The browser normally sends an absolute Referer, but accepting a
    // relative proxy path makes the helper usable from tests and the client.
    parsed = new URL(value, "http://curio.local");
  } catch {
    return null;
  }
  const prefix = `${basePath}/`;
  if (!parsed.pathname.startsWith(prefix)) {
    return null;
  }
  const rest = parsed.pathname.slice(prefix.length);
  const slash = rest.indexOf("/");
  const encodedOrigin = slash === -1 ? rest : rest.slice(0, slash);
  const path = slash === -1 ? "/" : rest.slice(slash);
  let origin: string;
  try {
    origin = decodeURIComponent(encodedOrigin);
  } catch {
    return null;
  }
  if (!/^https?:\/\//iu.test(origin)) {
    return null;
  }
  try {
    return `${origin}${path}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}
