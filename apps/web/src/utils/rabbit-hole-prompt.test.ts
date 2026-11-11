import { describe, expect, it } from "vitest";

import { parseRabbitHoleUserPrompt } from "./rabbit-hole-prompt";

const RECAP_PROMPT = [
  "My Rabbit Hole session just ended. Here is the captured digest:",
  "<rabbit_hole_digest>",
  "# Rabbit Hole — async runtimes",
  "### 1. Tokio",
  "</rabbit_hole_digest>",
  "",
  "What mattered most to me:",
  "<learner_takeaways>",
  "Focus on scheduler fairness",
  "</learner_takeaways>",
].join("\n");

describe("parseRabbitHoleUserPrompt", () => {
  it("extracts the digest and takeaways from a recap prompt", () => {
    const view = parseRabbitHoleUserPrompt(RECAP_PROMPT);

    expect(view).not.toBeNull();
    expect(view?.target).toBe("recap");
    expect(view?.digest).toContain("# Rabbit Hole — async runtimes");
    expect(view?.takeaways).toBe("Focus on scheduler fairness");
  });

  it("detects the course prompt", () => {
    const view = parseRabbitHoleUserPrompt(
      `${RECAP_PROMPT}\nBuild a course from this session.`
    );

    expect(view?.target).toBe("course");
  });

  it("ignores ordinary user messages", () => {
    expect(parseRabbitHoleUserPrompt("Build me a course on Rust")).toBeNull();
  });
});
