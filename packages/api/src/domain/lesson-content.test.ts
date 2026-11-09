import { describe, expect, it } from "vitest";

import { lessonContentSchema, toStoredLessonContent } from "./lesson-content";

describe("toStoredLessonContent", () => {
  it("keeps the cursor token and shared source on guided code steps", () => {
    const payload = lessonContentSchema.parse({
      code: { language: "typescript", source: "const value = user.name;" },
      kind: "guided-explanation",
      steps: [
        {
          narration: "Read the user name property.",
          visual: {
            focus: {
              cursor: { token: "user.name" },
              lines: [1],
            },
            kind: "code",
          },
        },
        {
          narration: "Store it in the value.",
          visual: {
            focus: { cursor: { column: 7 }, lines: [1] },
            kind: "code",
          },
        },
      ],
    });

    const stored = toStoredLessonContent(payload);
    expect(stored.kind).toBe("guided-explanation");
    if (stored.kind !== "guided-explanation") {
      return;
    }

    expect(stored.steps[0]?.visual.source).toBe("const value = user.name;");
    expect(stored.steps[0]?.visual.language).toBe("typescript");
    expect(stored.steps[0]?.visual.focus?.cursor?.token).toBe("user.name");
    expect(stored.steps[1]?.visual.focus?.cursor?.column).toBe(7);
  });
});
