import { describe, expect, it } from "vitest";

import { guidedCodeLanguageHint } from "./guided-explanation-stages";

describe("guidedCodeLanguageHint", () => {
  it("keeps explicit aliases", () => {
    expect(guidedCodeLanguageHint("ts", "anything")).toBe("typescript");
    expect(guidedCodeLanguageHint("sh", "echo hi")).toBe("bash");
  });

  it("infers a language when the authored hint is generic", () => {
    expect(guidedCodeLanguageHint("text", "const answer = 42;")).toBe(
      "typescript"
    );
    expect(
      guidedCodeLanguageHint("plaintext", "def greet(name):\n  pass")
    ).toBe("python");
  });

  it("guesses from source when no hint is provided", () => {
    expect(guidedCodeLanguageHint(undefined, "func main() {}")).toBe("go");
    expect(guidedCodeLanguageHint(undefined, "SELECT id FROM courses;")).toBe(
      "sql"
    );
  });
});
