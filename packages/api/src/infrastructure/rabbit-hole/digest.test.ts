import { describe, expect, it } from "vitest";

import { buildRabbitHoleDigest, buildRabbitHoleFollowUpPrompt } from "./digest";
import type {
  RabbitHoleHighlight,
  RabbitHoleNote,
  RabbitHoleVisit,
} from "./types";

function visit(overrides: Partial<RabbitHoleVisit> = {}): RabbitHoleVisit {
  return {
    dwellMs: 65_000,
    enteredAt: 1000,
    excerpt: "A compact explanation of the topic with a worked example.",
    id: "visit_1",
    leftAt: 66_000,
    media: [],
    scrollDepth: 0.75,
    title: "Understanding the scheduler",
    url: "https://example.com/scheduler",
    ...overrides,
  };
}

function note(overrides: Partial<RabbitHoleNote> = {}): RabbitHoleNote {
  return {
    at: 2000,
    id: "note_1",
    text: "Keep the comparison table for later.",
    title: "Understanding the scheduler",
    url: "https://example.com/scheduler",
    ...overrides,
  };
}

function highlight(
  overrides: Partial<RabbitHoleHighlight> = {}
): RabbitHoleHighlight {
  return {
    at: 3000,
    id: "highlight_1",
    quote: "Work stealing keeps idle cores busy.",
    title: "Understanding the scheduler",
    url: "https://example.com/scheduler",
    ...overrides,
  };
}

describe("buildRabbitHoleDigest", () => {
  it("renders the trail, learner notes and highlights", () => {
    const result = buildRabbitHoleDigest({
      endedAt: 10 * 60_000,
      highlights: [highlight()],
      notes: [note({ reply: "On it." })],
      startedAt: 1000,
      topic: "Rust async runtimes",
      visits: [visit()],
    });

    expect(result.digest).toContain("# Rabbit Hole — Rust async runtimes");
    expect(result.digest).toContain("https://example.com/scheduler");
    expect(result.digest).toContain("Learner note: Keep the comparison table");
    expect(result.digest).toContain("Work stealing keeps idle cores busy.");
    expect(result.stats).toEqual({
      durationMs: 599_000,
      highlights: 1,
      media: 0,
      notes: 1,
      pages: 1,
    });
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.noteCount).toBe(1);
    expect(result.pages[0]?.highlightCount).toBe(1);
    expect(result.topic).toBe("Rust async runtimes");
  });

  it("counts unique media across pages", () => {
    const result = buildRabbitHoleDigest({
      endedAt: 2000,
      highlights: [],
      notes: [],
      startedAt: 1000,
      topic: null,
      visits: [
        visit({
          media: [
            { kind: "video", title: "Talk", url: "https://youtu.be/abc" },
          ],
        }),
        visit({
          id: "visit_2",
          media: [
            { kind: "video", title: "Talk", url: "https://youtu.be/abc" },
            { kind: "embed", url: "https://example.com/chart" },
          ],
          url: "https://example.com/chart",
        }),
      ],
    });

    expect(result.stats.media).toBe(2);
  });

  it("falls back to a placeholder when no page was opened", () => {
    const result = buildRabbitHoleDigest({
      endedAt: 2000,
      highlights: [],
      notes: [note()],
      startedAt: 1000,
      topic: null,
      visits: [visit({ url: "about:blank" })],
    });

    expect(result.stats.pages).toBe(0);
    expect(result.digest).toContain("No pages were opened");
  });

  it("caps the digest for very long sessions", () => {
    const visits = Array.from({ length: 60 }, (_, index) =>
      visit({
        excerpt: "x".repeat(4000),
        id: `visit_${index}`,
        title: `Page ${index}`,
        url: `https://example.com/page-${index}`,
      })
    );
    const result = buildRabbitHoleDigest({
      endedAt: 3_600_000,
      highlights: [],
      notes: [],
      startedAt: 0,
      topic: "Long session",
      visits,
    });

    expect(result.digest.length).toBeLessThanOrEqual(14_100);
    expect(result.stats.pages).toBe(60);
  });

  it("keeps notes attached to pages that were never committed to the trail", () => {
    const result = buildRabbitHoleDigest({
      endedAt: 2000,
      highlights: [highlight({ url: "https://example.com/other" })],
      notes: [note({ url: "https://example.com/other" })],
      startedAt: 1000,
      topic: null,
      visits: [visit()],
    });

    expect(result.digest).toContain("## Other notes");
    expect(result.digest).toContain("## Other highlights");
  });
});

describe("buildRabbitHoleFollowUpPrompt", () => {
  it("wraps the digest and takeaways for a recap", () => {
    const prompt = buildRabbitHoleFollowUpPrompt({
      digest: "# digest body",
      takeaways: "Focus on scheduling",
      target: "recap",
    });

    expect(prompt).toContain("<rabbit_hole_digest>\n# digest body");
    expect(prompt).toContain("<learner_takeaways>\nFocus on scheduling");
    expect(prompt).toContain("Write recap notes");
  });

  it("tells the Director to skip preference questions for a course", () => {
    const prompt = buildRabbitHoleFollowUpPrompt({
      digest: "digest",
      takeaways: "",
      target: "course",
    });

    expect(prompt).toContain("skip the ask_user preference questions");
    expect(prompt).toContain("create_course");
    expect(prompt).toContain("No explicit takeaways");
  });
});
