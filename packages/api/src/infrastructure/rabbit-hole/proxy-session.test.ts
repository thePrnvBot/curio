import { describe, expect, it } from "vitest";

import { RabbitHoleProxySession } from "./proxy-session";
import type { RabbitHoleEvent } from "./types";

function emptyPage(
  url: string,
  overrides: Partial<Parameters<RabbitHoleProxySession["recordPage"]>[0]> = {}
) {
  return {
    media: [],
    scroll: 0,
    text: "",
    title: "",
    url,
    ...overrides,
  };
}

describe("RabbitHoleProxySession", () => {
  it("starts on a seed URL and records a page", () => {
    const session = RabbitHoleProxySession.open({
      chatId: "chat_1",
      id: "rh_1",
      seedUrls: ["https://example.com/docs"],
      topic: "Docs",
    });

    expect(session.getState().url).toBe("https://example.com/docs");
    expect(session.proxyToken).toMatch(/^rht_/u);

    session.recordPage(
      emptyPage("https://example.com/docs", {
        scroll: 0.5,
        text: "Hello world",
        title: "Docs",
      })
    );

    const visits = session.getVisits();
    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({
      excerpt: "Hello world",
      scrollDepth: 0.5,
      title: "Docs",
      url: "https://example.com/docs",
    });
    expect(session.getState().title).toBe("Docs");
  });

  it("merges repeated captures of the same page", () => {
    const session = RabbitHoleProxySession.open({
      chatId: "chat_1",
      id: "rh_1",
      seedUrls: [],
      topic: null,
    });
    session.recordPage(emptyPage("https://example.com/a", { title: "A" }));
    session.recordPage(
      emptyPage("https://example.com/a", {
        scroll: 0.8,
        text: "Longer text",
        title: "A better title",
      })
    );

    expect(session.getVisits()).toHaveLength(1);
    expect(session.getVisits()[0]).toMatchObject({
      excerpt: "Longer text",
      scrollDepth: 0.8,
      title: "A better title",
    });
  });

  it("closes a visit when navigating and folds a quick revisit", () => {
    const session = RabbitHoleProxySession.open({
      chatId: "chat_1",
      id: "rh_1",
      seedUrls: [],
      topic: null,
    });
    session.recordPage(emptyPage("https://example.com/a", { title: "A" }));
    session.recordPage(emptyPage("https://example.com/b", { title: "B" }));

    expect(session.getVisits()).toHaveLength(2);
    expect(session.getVisits()[0]?.leftAt).not.toBeNull();

    session.recordPage(
      emptyPage("https://example.com/a", { title: "A again" })
    );

    expect(session.getVisits()).toHaveLength(2);
    expect(session.getVisits()[0]?.title).toBe("A again");
    expect(session.getState().url).toBe("https://example.com/a");
  });

  it("stores notes and highlights against the current page", () => {
    const session = RabbitHoleProxySession.open({
      chatId: "chat_1",
      id: "rh_1",
      seedUrls: [],
      topic: null,
    });
    session.recordPage(
      emptyPage("https://example.com/a", {
        text: "Some content",
        title: "A",
      })
    );

    const note = session.addNote({ reply: "Okay", text: "Remember this" });
    expect(note).toMatchObject({
      reply: "Okay",
      text: "Remember this",
      title: "A",
      url: "https://example.com/a",
    });

    const highlight = session.addHighlight("A quote");
    expect(highlight).toMatchObject({
      quote: "A quote",
      title: "A",
      url: "https://example.com/a",
    });
    expect(session.currentPageExcerpt()).toBe("Some content");
  });

  it("emits events and ends with the final dwell", () => {
    const session = RabbitHoleProxySession.open({
      chatId: "chat_1",
      id: "rh_1",
      seedUrls: [],
      topic: "Topic",
    });
    const events: RabbitHoleEvent[] = [];
    session.subscribe((event) => events.push(event));
    session.recordPage(emptyPage("https://example.com/a", { title: "A" }));
    session.end();

    expect(events.some((event) => event.type === "visits")).toBe(true);
    expect(events.some((event) => event.type === "ended")).toBe(true);
    expect(session.status).toBe("ended");
    expect(session.getState().endedAt).not.toBeNull();
    expect(session.getVisits()[0]?.leftAt).not.toBeNull();
  });

  it("ignores non-http pages", () => {
    const session = RabbitHoleProxySession.open({
      chatId: "chat_1",
      id: "rh_1",
      seedUrls: [],
      topic: null,
    });
    session.recordPage(emptyPage("about:blank"));
    session.recordPage(emptyPage("file:///etc/passwd"));
    expect(session.getVisits()).toHaveLength(0);
  });
});
