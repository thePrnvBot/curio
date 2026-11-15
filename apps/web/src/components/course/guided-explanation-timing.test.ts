import { describe, expect, it } from "vitest";

import {
  MAX_NARRATION_SENTENCE_CHARS,
  narrationSentences,
} from "./guided-explanation-timing";

describe("narrationSentences", () => {
  it("splits on sentence punctuation", () => {
    expect(narrationSentences("First. Second! Third?")).toEqual([
      "First.",
      "Second!",
      "Third?",
    ]);
  });

  it("trims whitespace and drops empty entries", () => {
    expect(narrationSentences("  Hello there.  ")).toEqual(["Hello there."]);
    expect(narrationSentences("   ")).toEqual([]);
  });

  it("splits an over-long sentence without dropping words", () => {
    const long = Array.from({ length: 250 }, (_, index) => `word${index}`).join(
      " "
    );
    const sentences = narrationSentences(long);

    expect(sentences.length).toBeGreaterThan(1);
    expect(
      sentences.every((s) => s.length <= MAX_NARRATION_SENTENCE_CHARS)
    ).toBe(true);
    expect(sentences.join(" ")).toBe(long);
  });

  it("keeps an unbroken blob in one piece instead of looping", () => {
    const blob = "x".repeat(MAX_NARRATION_SENTENCE_CHARS * 2);
    const sentences = narrationSentences(blob);

    expect(sentences).toHaveLength(1);
    expect(sentences[0]).toHaveLength(MAX_NARRATION_SENTENCE_CHARS * 2);
  });
});
