import { describe, expect, it } from "vitest";

import { toUIMessage } from "./chat";

describe("chat domain", () => {
  describe("toUIMessage", () => {
    it("preserves id, role and parts", () => {
      const record = {
        id: "msg-1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "hello" }],
        createdAt: "2026-01-01T00:00:00Z",
      };

      expect(toUIMessage(record)).toEqual({
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
      });
    });
  });
});
