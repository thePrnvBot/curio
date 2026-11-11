/// <reference lib="dom" />
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { buildTrackerScript } from "./tracker";

beforeEach(() => {
  vi.useFakeTimers();
  document.title = "Tracker test";
  document.body.innerHTML = "<p>Hello <strong>world</strong></p>";
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("sends a ready event and a page snapshot to the parent", () => {
  const postMessage = vi.spyOn(window, "postMessage");
  const script = buildTrackerScript({
    parentOrigin: "http://localhost:3001",
    proxyBasePath: "/api/rabbit-hole/rh_1/proxy/token",
    sessionId: "rh_1",
    targetUrl: "https://example.com/docs",
    token: "token",
  });

  window.eval(script);
  document.dispatchEvent(new Event("DOMContentLoaded"));

  const messages = postMessage.mock.calls.map((call) => call[0]);
  expect(messages).toContainEqual(
    expect.objectContaining({
      __curio: true,
      event: "ready",
      sessionId: "rh_1",
      token: "token",
      url: "https://example.com/docs",
    })
  );
  expect(messages).toContainEqual(
    expect.objectContaining({
      event: "page",
      text: expect.stringContaining("Hello world"),
      title: "Tracker test",
      url: "https://example.com/docs",
    })
  );
});

it("does not double-proxy URLs the server already rewrote", () => {
  const base = "/api/rabbit-hole/rh_1/proxy/token";
  document.body.innerHTML = [
    `<a id="already" href="${base}/https%3A%2F%2Fexample.com/next">Next</a>`,
    `<a id="root" href="/plain">Plain</a>`,
    `<img id="image" src="${base}/https%3A%2F%2Fexample.com/img.png">`,
  ].join("");

  window.eval(
    buildTrackerScript({
      parentOrigin: "http://localhost:3001",
      proxyBasePath: base,
      sessionId: "rh_1",
      targetUrl: "https://example.com/docs",
      token: "token",
    })
  );
  document.dispatchEvent(new Event("DOMContentLoaded"));

  expect(document.querySelector("#already")?.getAttribute("href")).toBe(
    `${base}/https%3A%2F%2Fexample.com/next`
  );
  expect(document.querySelector("#root")?.getAttribute("href")).toBe(
    `${base}/https%3A%2F%2Fexample.com/plain`
  );
  expect(document.querySelector("#image")?.getAttribute("src")).toBe(
    `${base}/https%3A%2F%2Fexample.com/img.png`
  );
});

it("recovers the upstream URL when a router re-pushes the proxy path", () => {
  const base = "/api/rabbit-hole/rh_1/proxy/token";
  const postMessage = vi.spyOn(window, "postMessage");
  window.eval(
    buildTrackerScript({
      parentOrigin: "http://localhost:3001",
      proxyBasePath: base,
      sessionId: "rh_1",
      targetUrl: "https://example.com/docs",
      token: "token",
    })
  );
  document.dispatchEvent(new Event("DOMContentLoaded"));

  window.history.replaceState(
    {},
    "",
    `${base}/https%3A%2F%2Fexample.com/other`
  );
  vi.advanceTimersByTime(300);

  expect(postMessage.mock.calls.map((call) => call[0])).toContainEqual(
    expect.objectContaining({
      event: "page",
      url: "https://example.com/other",
    })
  );
});

it("answers a selection request from the parent", () => {
  const postMessage = vi.spyOn(window, "postMessage");
  window.eval(
    buildTrackerScript({
      parentOrigin: "http://localhost:3001",
      proxyBasePath: "/api/rabbit-hole/rh_1/proxy/token",
      sessionId: "rh_1",
      targetUrl: "https://example.com/docs",
      token: "token",
    })
  );
  document.dispatchEvent(new Event("DOMContentLoaded"));

  const range = document.createRange();
  range.selectNodeContents(document.querySelector("p") as HTMLParagraphElement);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);

  window.dispatchEvent(
    new MessageEvent("message", {
      data: {
        __curioCommand: true,
        command: "capture-selection",
        requestId: "req_1",
        sessionId: "rh_1",
        token: "token",
      },
      source: window,
    })
  );

  expect(postMessage.mock.calls.map((call) => call[0])).toContainEqual(
    expect.objectContaining({
      event: "selection",
      quote: "Hello world",
      requestId: "req_1",
    })
  );
});
