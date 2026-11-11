/**
 * Pure helpers shared by the browser engine and the Rabbit Hole overlay.
 * Kept free of Node APIs so the client bundle can import them.
 */

const HTTP_URL = /^https?:\/\/[^\s]+$/iu;
const DOMAIN_LIKE = /^[\w-]+(?:\.[\w-]+)+(?:[/?#][^\s]*)?$/u;

/** A readable hostname for trail rows, falling back to the raw URL. */
export function rabbitHoleHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return url;
  }
}

/**
 * Turns omnibox input into a navigable URL. Domains get `https://`, anything
 * that is not domain-like becomes a DuckDuckGo search, and already-schemed
 * URLs pass through untouched.
 */
export function normalizeRabbitHoleUrl(raw: string): string | null {
  const value = raw.trim();
  if (value === "") {
    return null;
  }
  if (HTTP_URL.test(value)) {
    return value;
  }
  if (DOMAIN_LIKE.test(value)) {
    return `https://${value}`;
  }
  const looksLikeHostWithPort = /^[\w.-]+:\d+(?:[/?#].*)?$/u.test(value);
  if (looksLikeHostWithPort) {
    return `https://${value}`;
  }
  return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
}

/** Compact dwell time for the trail: `0:42`, `3:07`, `1:02:09`. */
export function formatRabbitHoleDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const paddedSeconds = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
  }
  return `${minutes}:${paddedSeconds}`;
}
