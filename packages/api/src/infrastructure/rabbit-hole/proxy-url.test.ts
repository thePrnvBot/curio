import { describe, expect, it } from "vitest";

import {
  buildProxyUrl,
  decodeProxyTarget,
  proxyBasePath,
  targetFromProxyUrl,
  toProxyUrl,
} from "./proxy-url";

describe("proxyBasePath", () => {
  it("escapes the session and token segments", () => {
    expect(proxyBasePath("rh_1", "a/b")).toBe(
      "/api/rabbit-hole/rh_1/proxy/a%2Fb"
    );
  });
});

describe("buildProxyUrl", () => {
  it("keeps the target path, query and hash", () => {
    expect(
      buildProxyUrl(
        "/api/rabbit-hole/rh_1/proxy/token",
        "https://example.com/docs/page?q=1#intro"
      )
    ).toBe(
      "/api/rabbit-hole/rh_1/proxy/token/https%3A%2F%2Fexample.com/docs/page?q=1#intro"
    );
  });
});

describe("toProxyUrl", () => {
  const basePath = "/api/rabbit-hole/rh_1/proxy/token";

  it("rewrites absolute URLs to their own origin segment", () => {
    expect(
      toProxyUrl(
        "https://other.test/a?b=1",
        "https://example.com/docs",
        basePath
      )
    ).toBe("/api/rabbit-hole/rh_1/proxy/token/https%3A%2F%2Fother.test/a?b=1");
  });

  it("resolves root-relative URLs against the page", () => {
    expect(
      toProxyUrl("/assets/app.css", "https://example.com/docs/page", basePath)
    ).toBe(
      "/api/rabbit-hole/rh_1/proxy/token/https%3A%2F%2Fexample.com/assets/app.css"
    );
  });

  it("resolves relative URLs against the page", () => {
    expect(
      toProxyUrl("../img/logo.png", "https://example.com/docs/page", basePath)
    ).toBe(
      "/api/rabbit-hole/rh_1/proxy/token/https%3A%2F%2Fexample.com/img/logo.png"
    );
  });

  it("keeps same-document fragments", () => {
    expect(
      toProxyUrl("#section", "https://example.com/docs/page", basePath)
    ).toBe("#section");
  });

  it("leaves an already-proxied URL alone", () => {
    const proxied = `${basePath}/https%3A%2F%2Fexample.com/next`;
    expect(toProxyUrl(proxied, "https://example.com/docs/page", basePath)).toBe(
      proxied
    );
  });

  it("ignores non-http schemes", () => {
    for (const value of [
      "data:image/png;base64,AAAA",
      "mailto:hello@example.com",
      "ftp://example.com/file",
      "blob:https://example.com/id",
      "ws://example.com/socket",
    ]) {
      expect(toProxyUrl(value, "https://example.com/", basePath)).toBeNull();
    }
  });
});

describe("decodeProxyTarget", () => {
  it("reconstructs the upstream URL", () => {
    expect(
      decodeProxyTarget("https://example.com", "docs/page", "?q=1")?.href
    ).toBe("https://example.com/docs/page?q=1");
  });

  it("handles an empty path", () => {
    expect(decodeProxyTarget("https://example.com", "", "")?.href).toBe(
      "https://example.com/"
    );
  });

  it("rejects non-http origins", () => {
    expect(decodeProxyTarget("file:///etc/passwd", "x", "")).toBeNull();
  });
});

describe("targetFromProxyUrl", () => {
  const basePath = "/api/rabbit-hole/rh_1/proxy/token";

  it("round-trips a proxied URL", () => {
    const proxied = buildProxyUrl(
      basePath,
      "https://example.com/docs/page?q=1#intro"
    );
    expect(targetFromProxyUrl(proxied, basePath)).toBe(
      "https://example.com/docs/page?q=1#intro"
    );
  });

  it("returns null for unrelated URLs", () => {
    expect(targetFromProxyUrl("https://example.com/", basePath)).toBeNull();
  });
});
