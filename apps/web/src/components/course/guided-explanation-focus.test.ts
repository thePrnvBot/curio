import { describe, expect, it } from "vitest";

import { resolveGuidedCodeFocus } from "./guided-explanation-focus";

describe("resolveGuidedCodeFocus", () => {
  it("prefers executable code over the same word inside a string", () => {
    expect(
      resolveGuidedCodeFocus({
        focus: {
          cursor: { token: "total" },
          lines: [1],
        },
        narration: "Log the running total.",
        source: 'console.log("total:", total);',
      })
    ).toEqual({
      cursor: { column: 23, length: 5, line: 1 },
      lines: [1],
    });
  });

  it("anchors an authored token exactly even when the authored column is wrong", () => {
    const source = [
      "function parse(value: string) {",
      "  try {",
      "    return JSON.parse(value) as unknown;",
      "  } catch (error) {",
      "    return null;",
      "  }",
      "}",
    ].join("\n");

    expect(
      resolveGuidedCodeFocus({
        focus: {
          cursor: { column: 1, length: 1, line: 3, token: "unknown" },
          lines: [3],
        },
        narration: "Cast the parsed value to unknown.",
        source,
      })
    ).toEqual({
      cursor: { column: 33, length: 7, line: 3 },
      lines: [3],
    });
  });

  it("locates dotted tokens copied from the excerpt", () => {
    expect(
      resolveGuidedCodeFocus({
        focus: {
          cursor: { token: "user.name" },
          lines: [1],
        },
        narration: "Read the user name property.",
        source: "const value = user.name;",
      })
    ).toEqual({
      cursor: { column: 15, length: 9, line: 1 },
      lines: [1],
    });
  });

  it("snaps a slightly miscounted authored column to the real token", () => {
    expect(
      resolveGuidedCodeFocus({
        focus: {
          cursor: { column: 8, length: 4 },
          lines: [1],
        },
        narration: "The accumulator starts at zero.",
        source: "const accumulator = 0;",
      })
    ).toEqual({
      cursor: { column: 7, length: 11, line: 1 },
      lines: [1],
    });
  });

  it("overrides a fallback column that points at a token the narration never names", () => {
    expect(
      resolveGuidedCodeFocus({
        focus: {
          cursor: { column: 10, length: 5 },
          lines: [1],
        },
        narration: "The reduce helper walks the list.",
        source: "const total = items.reduce((sum, item) => sum + item, 0);",
      })
    ).toEqual({
      cursor: { column: 21, length: 6, line: 1 },
      lines: [1],
    });
  });

  it("keeps a fallback column when the narration names its token", () => {
    expect(
      resolveGuidedCodeFocus({
        focus: {
          cursor: { column: 10, length: 5 },
          lines: [1],
        },
        narration: "The total accumulates every price.",
        source: "const total = items.reduce((sum, item) => sum + item, 0);",
      })
    ).toEqual({
      cursor: { column: 7, length: 5, line: 1 },
      lines: [1],
    });
  });

  it("infers the narrated token with real character positions", () => {
    expect(
      resolveGuidedCodeFocus({
        narration: "The accumulator starts at zero.",
        source: "const accumulator = 0;",
      })
    ).toEqual({
      cursor: { column: 7, length: 11, line: 1 },
      lines: [1],
    });
  });

  it("prefers the authored focus line when a token appears more than once", () => {
    expect(
      resolveGuidedCodeFocus({
        focus: { lines: [2] },
        narration: "Now the total comes back.",
        source: ["let total = 0;", "return total;"].join("\n"),
      })
    ).toEqual({
      cursor: { column: 8, length: 5, line: 2 },
      lines: [2],
    });
  });

  it("uses backticked narration references ahead of plain prose words", () => {
    expect(
      resolveGuidedCodeFocus({
        narration: "The loop adds each `item` to the running total.",
        source: "const sum = items.reduce((total, item) => total + item, 0);",
      })
    ).toEqual({
      cursor: { column: 34, length: 4, line: 1 },
      lines: [1],
    });
  });

  it("ignores words that only appear inside comments", () => {
    expect(
      resolveGuidedCodeFocus({
        narration: "The total is accumulated here.",
        source: ["// total is the accumulator", "const sum = 0;"].join("\n"),
      })
    ).toBeNull();
  });

  it("keeps the resolved cursor line bright even when it is not authored", () => {
    expect(
      resolveGuidedCodeFocus({
        focus: {
          cursor: { token: "error" },
          lines: [1],
        },
        narration: "Handle the error here.",
        source: ["const value = 1;", "throw error;"].join("\n"),
      })
    ).toEqual({
      cursor: { column: 7, length: 5, line: 2 },
      lines: [1, 2],
    });
  });

  it("falls back to narration when authored focus lines are out of range", () => {
    expect(
      resolveGuidedCodeFocus({
        focus: { lines: [40] },
        narration: "The count grows.",
        source: "let count = 0;",
      })
    ).toEqual({
      cursor: { column: 5, length: 5, line: 1 },
      lines: [1],
    });
  });

  it("returns null for blank code", () => {
    expect(
      resolveGuidedCodeFocus({ narration: "Anything.", source: "  \n " })
    ).toBeNull();
  });
});
