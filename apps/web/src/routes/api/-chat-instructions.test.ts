import { MAX_CUSTOM_INSTRUCTIONS_LENGTH } from "@curio/api/domain/learning-preferences";
import { describe, expect, it } from "vitest";

import {
  buildChatInstructions,
  CHAT_BASE_INSTRUCTIONS,
} from "./-chat-instructions";

describe("buildChatInstructions", () => {
  it("uses the base instructions when no preferences are saved", () => {
    expect(buildChatInstructions(null)).toBe(CHAT_BASE_INSTRUCTIONS);
    expect(buildChatInstructions("   ")).toBe(CHAT_BASE_INSTRUCTIONS);
  });

  it("appends trimmed preferences inside the learner block", () => {
    const result = buildChatInstructions("  Use analogies.   Quiz me often.  ");
    expect(result).toContain(CHAT_BASE_INSTRUCTIONS);
    expect(result).toContain(
      "<learner_preferences>\nUse analogies.   Quiz me often.\n</learner_preferences>"
    );
  });

  it("caps preferences at the settings limit", () => {
    const tooLong = "a".repeat(MAX_CUSTOM_INSTRUCTIONS_LENGTH + 50);
    const result = buildChatInstructions(tooLong);
    expect(result).toContain("a".repeat(MAX_CUSTOM_INSTRUCTIONS_LENGTH));
    expect(result).not.toContain(
      "a".repeat(MAX_CUSTOM_INSTRUCTIONS_LENGTH + 1)
    );
  });
});
