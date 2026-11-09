import { describe, expect, it } from "vitest";

import {
  API_CONTENT_SECURITY_POLICY,
  DOCUMENT_CONTENT_SECURITY_POLICY,
  SECURITY_HEADERS,
  withSecurityHeaders,
} from "./security-headers";

describe("security-headers", () => {
  it("restricts document images to self, data and blob", () => {
    expect(DOCUMENT_CONTENT_SECURITY_POLICY).toBe(
      "img-src 'self' data: blob:; base-uri 'self';"
    );
    expect(DOCUMENT_CONTENT_SECURITY_POLICY).toContain(
      "img-src 'self' data: blob:"
    );
  });

  it("does not apply API network restrictions to the document", () => {
    expect(DOCUMENT_CONTENT_SECURITY_POLICY).not.toContain(
      "default-src 'self'"
    );
    expect(DOCUMENT_CONTENT_SECURITY_POLICY).not.toContain(
      "connect-src 'self'"
    );
    expect(DOCUMENT_CONTENT_SECURITY_POLICY).not.toContain("frame-src");
    expect(DOCUMENT_CONTENT_SECURITY_POLICY).not.toContain("media-src");
  });

  it("keeps the full policy on API responses", () => {
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toBe(
      API_CONTENT_SECURITY_POLICY
    );
    expect(API_CONTENT_SECURITY_POLICY).toContain("default-src 'self'");
    expect(API_CONTENT_SECURITY_POLICY).toContain("connect-src 'self'");
    expect(API_CONTENT_SECURITY_POLICY).toContain(
      "img-src 'self' data: blob:"
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
