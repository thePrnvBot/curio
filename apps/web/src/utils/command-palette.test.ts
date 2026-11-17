import { describe, expect, it } from "vitest";

import {
  filterPaletteEntries,
  matchesPaletteQuery,
  paletteGroupOrder,
} from "./command-palette";

const ENTRIES = [
  { group: "Pages", id: "home", label: "Home" },
  {
    group: "Actions",
    id: "theme",
    keywords: "dark light appearance",
    label: "Switch theme",
  },
  { group: "Chats", id: "chat-1", label: "Recursion, explained" },
] as const;

describe("command palette", () => {
  it("keeps every entry for an empty or whitespace query", () => {
    expect(filterPaletteEntries(ENTRIES, "")).toHaveLength(3);
    expect(filterPaletteEntries(ENTRIES, "   ")).toHaveLength(3);
  });

  it("matches labels case-insensitively", () => {
    expect(filterPaletteEntries(ENTRIES, "RECURSION")).toEqual([ENTRIES[2]]);
  });

  it("matches keywords that are not in the label", () => {
    expect(filterPaletteEntries(ENTRIES, "appearance")).toEqual([ENTRIES[1]]);
    expect(matchesPaletteQuery(ENTRIES[1], "dark")).toBe(true);
  });

  it("returns nothing for a query that matches no entry", () => {
    expect(filterPaletteEntries(ENTRIES, "zzzz")).toHaveLength(0);
  });

  it("puts chats first inside a conversation", () => {
    expect(paletteGroupOrder("/chat/abc")).toEqual([
      "Chats",
      "Pages",
      "Actions",
      "Courses",
    ]);
  });

  it("puts courses first inside a course", () => {
    expect(paletteGroupOrder("/courses/abc")).toEqual([
      "Courses",
      "Pages",
      "Actions",
      "Chats",
    ]);
  });

  it("keeps the default order elsewhere", () => {
    expect(paletteGroupOrder("/settings")).toEqual([
      "Pages",
      "Actions",
      "Chats",
      "Courses",
    ]);
    expect(paletteGroupOrder("/")).toEqual([
      "Pages",
      "Actions",
      "Chats",
      "Courses",
    ]);
  });
});
