import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import { collectSessionEntries } from "./chat-session-panel";

function linkEntries(messages: readonly UIMessage[]) {
  return collectSessionEntries(messages).filter(
    (entry) => entry.kind === "link"
  );
}

describe("collectSessionEntries link index", () => {
  it("collects links the user sent", () => {
    const messages: UIMessage[] = [
      {
        id: "user-1",
        parts: [
          {
            text: "Compare https://example.com/docs and https://example.com/docs.",
            type: "text",
          },
        ],
        role: "user",
      },
    ];
    const links = linkEntries(messages);
    expect(links).toHaveLength(1);
    expect(links[0]?.url).toBe("https://example.com/docs");
  });

  it("collects web_search results and web_read targets", () => {
    const messages: UIMessage[] = [
      {
        id: "assistant-1",
        parts: [
          {
            input: { query: "curio" },
            output: {
              results: [
                {
                  snippet: "snippet",
                  title: "Curio docs",
                  url: "https://docs.example.com/curio",
                },
              ],
            },
            state: "output-available",
            toolCallId: "search-1",
            type: "tool-web_search",
          },
          {
            input: { url: "https://read.example.com/page" },
            state: "input-available",
            toolCallId: "read-1",
            type: "tool-web_read",
          },
          {
            text: "Summary at https://summary.example.com/curio.",
            type: "text",
          },
        ],
        role: "assistant",
      },
    ];

    expect(linkEntries(messages).map((entry) => entry.url)).toEqual([
      "https://docs.example.com/curio",
      "https://read.example.com/page",
      "https://summary.example.com/curio",
    ]);
  });

  it("deduplicates source citations and prose links by URL", () => {
    const messages: UIMessage[] = [
      {
        id: "assistant-2",
        parts: [
          {
            sourceId: "source-1",
            title: "Curio",
            type: "source-url",
            url: "https://curio.example.com",
          },
          { text: "See https://curio.example.com", type: "text" },
        ],
        role: "assistant",
      },
    ];

    const links = linkEntries(messages);
    expect(links).toHaveLength(1);
    expect(links[0]?.title).toBe("Curio");
  });

  it("ignores malformed and non-http links", () => {
    const messages: UIMessage[] = [
      {
        id: "user-2",
        parts: [
          {
            text: "Not links: ftp://example.com, https://, and localhost",
            type: "text",
          },
        ],
        role: "user",
      },
    ];
    expect(linkEntries(messages)).toHaveLength(0);
  });
});
