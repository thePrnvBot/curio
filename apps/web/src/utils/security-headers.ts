/**
 * Document/API content policy. `img-src` intentionally excludes remote origins:
 * model-rendered markdown must not be able to send tracking beacons through
 * image URLs. Inline `data:` and `blob:` images (attachments/previews) remain
 * allowed.
 *
 * Note: `frame-ancestors` is ignored when delivered through a meta tag, so the
 * API responses rely on `SECURITY_HEADERS`/`X-Frame-Options` for clickjacking
 * protection.
 */
export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; " +
  "font-src 'self'; " +
  "connect-src 'self'; " +
  "media-src 'self' blob: data:; " +
  "worker-src 'self' blob:; " +
  "frame-ancestors 'none'; " +
  "base-uri 'self';";

/**
 * Minimal security headers applied to server route responses.
 *
 * In production behind a CDN (Cloudflare, Vercel, etc.) you will usually
 * configure these at the edge so they apply to static assets too; this
 * helper ensures API responses are not forgotten.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
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
