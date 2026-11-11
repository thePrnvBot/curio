import { describe, expect, it } from "vitest";

import {
  formatRabbitHoleDuration,
  normalizeRabbitHoleUrl,
  rabbitHoleHost,
} from "./url";

describe("normalizeRabbitHoleUrl", () => {
  it("keeps explicit http(s) urls", () => {
    expect(normalizeRabbitHoleUrl("https://tokio.rs/tokio/tutorial")).toBe(
      "https://tokio.rs/tokio/tutorial"
    );
    expect(normalizeRabbitHoleUrl("http://example.com")).toBe(
      "http://example.com"
    );
  });

  it("adds https to bare domains", () => {
    expect(normalizeRabbitHoleUrl("example.com")).toBe("https://example.com");
    expect(normalizeRabbitHoleUrl("docs.rs/tokio/latest/tokio")).toBe(
      "https://docs.rs/tokio/latest/tokio"
    );
    expect(normalizeRabbitHoleUrl("localhost:3001/chat")).toBe(
      "https://localhost:3001/chat"
    );
  });

  it("turns anything else into a DuckDuckGo search", () => {
    expect(normalizeRabbitHoleUrl("rust async runtime")).toBe(
      "https://duckduckgo.com/?q=rust%20async%20runtime"
    );
  });

  it("rejects blank input", () => {
    expect(normalizeRabbitHoleUrl("   ")).toBeNull();
  });
});

describe("rabbitHoleHost", () => {
  it("strips www and keeps the host only", () => {
    expect(rabbitHoleHost("https://www.example.com/a/b?c=d")).toBe(
      "example.com"
    );
  });

  it("falls back to the raw value for invalid urls", () => {
    expect(rabbitHoleHost("not a url")).toBe("not a url");
  });
});

describe("formatRabbitHoleDuration", () => {
  it("formats seconds, minutes and hours", () => {
    expect(formatRabbitHoleDuration(0)).toBe("0:00");
    expect(formatRabbitHoleDuration(42_000)).toBe("0:42");
    expect(formatRabbitHoleDuration(187_000)).toBe("3:07");
    expect(formatRabbitHoleDuration(3_729_000)).toBe("1:02:09");
  });
});
