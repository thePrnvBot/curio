import { describe, expect, it } from "vitest";

import { toSpokenNarration } from "./narration-text";

describe("toSpokenNarration", () => {
  it("removes markdown structure while keeping the words", () => {
    expect(
      toSpokenNarration(
        "## Heading\n- first `item`\n- [docs](https://example.com)"
      )
    ).toBe("Heading first item docs");
  });

  it("strips emphasis and turns inline code into spoken words", () => {
    expect(toSpokenNarration("Use **bold**, *italic* and `user_name`.")).toBe(
      "Use bold, italic and user name."
    );
  });

  it("speaks dotted calls without punctuation", () => {
    expect(toSpokenNarration("Call `console.log(error.message)` now.")).toBe(
      "Call console log error message now."
    );
  });

  it("expands comparison and logic operators", () => {
    expect(toSpokenNarration("x === 5 && y !== null")).toBe(
      "x strictly equals 5 and y does not equal null"
    );
  });

  it("speaks numbers and symbols instead of reading the marks", () => {
    expect(toSpokenNarration("Values are `#42` and 95%.")).toBe(
      "Values are number 42 and 95 percent."
    );
    expect(toSpokenNarration("It costs $5 and holds 10_000 items.")).toBe(
      "It costs 5 dollars and holds 10000 items."
    );
  });

  it("handles empty calls and snake_case identifiers", () => {
    expect(toSpokenNarration("Use `items.map()` on `user_input`.")).toBe(
      "Use items map on user input."
    );
  });

  it("speaks arrows and compound comparisons", () => {
    expect(toSpokenNarration("A → B, then C <= D.")).toBe(
      "A to B, then C less than or equal to D."
    );
  });

  it("drops link targets and image URLs", () => {
    expect(
      toSpokenNarration(
        "Read [the docs](https://example.com) and ![diagram](diagram.png)."
      )
    ).toBe("Read the docs and diagram.");
  });

  it("leaves ordinary prose punctuation alone", () => {
    expect(toSpokenNarration("It's a read-only flag, isn't it?")).toBe(
      "It's a read only flag, isn't it?"
    );
  });

  it("returns an empty string when nothing pronounceable remains", () => {
    expect(toSpokenNarration("*** --- ```")).toBe("");
  });
});
