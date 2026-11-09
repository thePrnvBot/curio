import { describe, expect, it } from "vitest";

import {
  CONTENT_SECURITY_POLICY,
  SECURITY_HEADERS,
  withSecurityHeaders,
} from "./security-headers";

describe("security-headers", () => {
  it("restricts document images to self, data and blob", () => {
    expect(CONTENT_SECURITY_POLICY).toContain(
      "img-src 'self' data: blob:"
    );
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toBe(
      CONTENT_SECURITY_POLICY
    );
  });

  it("applies the shared headers to a response", () => {
    const response = withSecurityHeaders(
      Response.json({ ok: true }, { status: 200 })
    );
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(response.headers.get(name)).toBe(value);
    }
  });

  it("preserves the original response body and status", async () => {
    const response = withSecurityHeaders(
      Response.json({ ok: true }, { status: 201 })
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
