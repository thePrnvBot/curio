/**
 * Minimal security headers applied to server route responses.
 *
 * In production behind a CDN (Cloudflare, Vercel, etc.) you will usually
 * configure these at the edge so they apply to static assets too; this
 * helper ensures API responses are not forgotten.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob:; " +
    "font-src 'self'; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self';",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

/** Return a copy of `response` with the shared security headers appended. */
export function withSecurityHeaders(response: Response): Response {
  const cloned = new Response(response.body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    cloned.headers.set(name, value);
  }
  return cloned;
}
