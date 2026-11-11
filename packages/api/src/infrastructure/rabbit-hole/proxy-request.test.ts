import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { proxyRabbitHoleRequest } from "./proxy";
import type { StoredRabbitHoleSession } from "./sessions";

function cookieHash(origin: string): string {
  return createHash("sha1").update(origin).digest("hex").slice(0, 12);
}

function fakeSession(
  recordPage: ReturnType<typeof vi.fn>
): StoredRabbitHoleSession {
  return {
    browser: {
      id: "rh_1",
      proxyToken: "token",
      recordPage,
    },
  } as unknown as StoredRabbitHoleSession;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("proxyRabbitHoleRequest", () => {
  it("forwards the page through the proxy, isolates cookies and records the visit", async () => {
    const upstreamFetch = vi.fn(
      (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(
          `<!doctype html><html><head><title>Docs</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'"></head><body><a href="/next">Next</a><p>Hello</p></body></html>`,
          {
            headers: {
              "content-security-policy": "default-src 'none'",
              "content-type": "text/html; charset=utf-8",
              "set-cookie":
                "sid=abc; Domain=.example.com; Path=/; Secure; SameSite=None",
              "x-frame-options": "DENY",
            },
            status: 200,
          }
        )
    );
    vi.stubGlobal("fetch", upstreamFetch);

    const recordPage = vi.fn();
    const hash = cookieHash("https://example.com");
    const request = new Request(
      "http://localhost:3001/api/rabbit-hole/rh_1/proxy/token/https%3A%2F%2Fexample.com/docs",
      {
        headers: {
          accept: "text/html",
          cookie: `better-auth.session_token=secret; __curio_rh_${hash}_sid=abc`,
          "sec-fetch-dest": "iframe",
        },
        method: "GET",
      }
    );

    const response = await proxyRabbitHoleRequest({
      basePath: "/api/rabbit-hole/rh_1/proxy/token",
      origin: "https://example.com",
      parentOrigin: "http://localhost:3001",
      request,
      session: fakeSession(recordPage),
      splat: "docs",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-frame-options")).toBeNull();
    expect(response.headers.get("content-security-policy")).toBeNull();
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain(`__curio_rh_${hash}_sid=abc`);
    expect(setCookie).toContain("Path=/api/rabbit-hole/rh_1/proxy/token");
    expect(setCookie).not.toContain("Domain=");
    expect(setCookie).not.toContain("Secure");

    const html = await response.text();
    expect(html).toContain("data-curio-tracker");
    expect(html).toContain(
      "/api/rabbit-hole/rh_1/proxy/token/https%3A%2F%2Fexample.com/next"
    );

    expect(recordPage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Hello"),
        title: "Docs",
        url: "https://example.com/docs",
      })
    );

    const upstreamInit = upstreamFetch.mock.calls[0]?.[1];
    const upstreamHeaders = upstreamInit?.headers as Headers;
    expect(upstreamHeaders.get("cookie")).toBe("sid=abc");
    expect(upstreamHeaders.get("cookie")).not.toContain("better-auth");
    expect(upstreamHeaders.get("referer")).toBe("https://example.com/docs");
  });

  it("rewrites redirects back through the proxy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string | URL | Request, _init?: RequestInit) =>
          new Response(null, {
            headers: { location: "/login" },
            status: 302,
          })
      )
    );

    const response = await proxyRabbitHoleRequest({
      basePath: "/api/rabbit-hole/rh_1/proxy/token",
      origin: "https://example.com",
      parentOrigin: "http://localhost:3001",
      request: new Request(
        "http://localhost:3001/api/rabbit-hole/rh_1/proxy/token/https%3A%2F%2Fexample.com/docs"
      ),
      session: fakeSession(vi.fn()),
      splat: "docs",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/api/rabbit-hole/rh_1/proxy/token/https%3A%2F%2Fexample.com/login"
    );
  });
});
