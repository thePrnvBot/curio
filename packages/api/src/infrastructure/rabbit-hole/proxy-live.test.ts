import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { proxyRabbitHoleRequest } from "./proxy";
import type { StoredRabbitHoleSession } from "./sessions";

let server: Server;
let origin = "";
const seen: { cookie?: string; referer?: string; url?: string }[] = [];

function cookieHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function fakeSession(
  recordPage: ReturnType<typeof vi.fn>
): StoredRabbitHoleSession {
  return {
    browser: { id: "rh_1", proxyToken: "token", recordPage },
  } as unknown as StoredRabbitHoleSession;
}

beforeAll(async () => {
  server = createServer((request, response) => {
    seen.push({
      cookie: request.headers.cookie,
      referer: request.headers.referer,
      url: request.url,
    });
    if (request.url === "/docs") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "set-cookie": "sid=abc; Path=/; HttpOnly",
        "x-frame-options": "DENY",
      });
      response.end(
        `<!doctype html><html><head><title>Live docs</title><link rel="stylesheet" href="/style.css"></head><body><a href="/next">Next</a><p>Hello live</p></body></html>`
      );
      return;
    }
    if (request.url === "/style.css") {
      response.writeHead(200, { "content-type": "text/css" });
      response.end("body { background: url(/bg.png); }");
      return;
    }
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "/docs" });
      response.end();
      return;
    }
    if (request.url === "/check") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(`<html><body>${request.headers.cookie ?? ""}</body></html>`);
      return;
    }
    response.writeHead(404);
    response.end("missing");
  });
  // oxlint-disable-next-line promise/avoid-new -- server listen callbacks are event-based
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  // oxlint-disable-next-line promise/avoid-new -- server close callbacks are event-based
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

describe("proxyRabbitHoleRequest against a live upstream", () => {
  it("fetches, rewrites and records a real page", async () => {
    const recordPage = vi.fn();
    const hash = cookieHash(origin);
    const response = await proxyRabbitHoleRequest({
      basePath: "/api/rabbit-hole/rh_1/proxy/token",
      origin,
      parentOrigin: "http://localhost:3001",
      request: new Request(
        `http://localhost:3001/api/rabbit-hole/rh_1/proxy/token/${encodeURIComponent(origin)}/docs`,
        {
          headers: {
            accept: "text/html",
            cookie: `better-auth.session_token=secret; __curio_rh_${hash}_sid=old`,
            "sec-fetch-dest": "iframe",
          },
        }
      ),
      session: fakeSession(recordPage),
      splat: "docs",
    });

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Live docs");
    expect(html).toContain("data-curio-tracker");
    expect(html).toContain(
      `/api/rabbit-hole/rh_1/proxy/token/${encodeURIComponent(origin)}/next`
    );
    expect(response.headers.get("x-frame-options")).toBeNull();
    expect(response.headers.get("set-cookie")).toContain(
      `__curio_rh_${hash}_sid=abc`
    );
    expect(recordPage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Hello live"),
        title: "Live docs",
        url: `${origin}/docs`,
      })
    );

    const first = seen.find((entry) => entry.url === "/docs");
    expect(first?.cookie).toBe("sid=old");
    expect(first?.cookie).not.toContain("better-auth");
    expect(first?.referer).toBe(`${origin}/docs`);
  });

  it("forwards only the namespaced site cookies upstream", async () => {
    const hash = cookieHash(origin);
    const response = await proxyRabbitHoleRequest({
      basePath: "/api/rabbit-hole/rh_1/proxy/token",
      origin,
      parentOrigin: "http://localhost:3001",
      request: new Request(
        `http://localhost:3001/api/rabbit-hole/rh_1/proxy/token/${encodeURIComponent(origin)}/check`,
        {
          headers: {
            cookie: `better-auth.session_token=secret; __curio_rh_${hash}_sid=abc`,
          },
        }
      ),
      session: fakeSession(vi.fn()),
      splat: "check",
    });

    const body = await response.text();
    expect(body).toContain("sid=abc");
    expect(body).not.toContain("better-auth");
  });

  it("rewrites CSS urls through the proxy", async () => {
    const response = await proxyRabbitHoleRequest({
      basePath: "/api/rabbit-hole/rh_1/proxy/token",
      origin,
      parentOrigin: "http://localhost:3001",
      request: new Request(
        `http://localhost:3001/api/rabbit-hole/rh_1/proxy/token/${encodeURIComponent(origin)}/style.css`
      ),
      session: fakeSession(vi.fn()),
      splat: "style.css",
    });

    expect(await response.text()).toContain(
      `/api/rabbit-hole/rh_1/proxy/token/${encodeURIComponent(origin)}/bg.png`
    );
  });

  it("rewrites redirects back through the proxy", async () => {
    const response = await proxyRabbitHoleRequest({
      basePath: "/api/rabbit-hole/rh_1/proxy/token",
      origin,
      parentOrigin: "http://localhost:3001",
      request: new Request(
        `http://localhost:3001/api/rabbit-hole/rh_1/proxy/token/${encodeURIComponent(origin)}/redirect`
      ),
      session: fakeSession(vi.fn()),
      splat: "redirect",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      `/api/rabbit-hole/rh_1/proxy/token/${encodeURIComponent(origin)}/docs`
    );
  });
});
