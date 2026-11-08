import { describe, expect, it } from "vitest";

import {
  toMcpError,
  unwrapToolResultRecord,
} from "./mcp-artifact-publisher";

describe("mcp-artifact-publisher", () => {
  describe("unwrapToolResultRecord", () => {
    it("returns structured content when present", () => {
      const result = unwrapToolResultRecord(
        {
          content: [{ text: "ignored", type: "text" }],
          isError: false,
          structuredContent: { projectId: "p1" },
        },
        "find_project"
      );
      expect(result).toEqual({ projectId: "p1" });
    });

    it("parses JSON from the first text block when structured content is absent", () => {
      const result = unwrapToolResultRecord(
        {
          content: [{ text: '{"uploadId":"u1"}', type: "text" }],
        },
        "stage_upload"
      );
      expect(result).toEqual({ uploadId: "u1" });
    });

    it("returns an empty record for empty content", () => {
      const result = unwrapToolResultRecord(
        { content: [], isError: false },
        "commit"
      );
      expect(result).toEqual({});
    });

    it("throws an ArtifactPublishFailed on MCP error", () => {
      expect(() =>
        unwrapToolResultRecord(
          {
            content: [{ text: "Something went wrong", type: "text" }],
            isError: true,
          },
          "stage_upload"
        )
      ).toThrow("Something went wrong");
    });

    it("throws on unexpected result shape", () => {
      expect(() =>
        unwrapToolResultRecord({ notContent: [] }, "stage_upload")
      ).toThrow("unexpected MCP result shape");
    });
  });

  describe("toMcpError", () => {
    it("produces an ArtifactPublishFailed with the operation title", () => {
      const error = toMcpError("MCP connect")("connection refused");
      expect(error._tag).toBe("ArtifactPublishFailed");
      expect(error.title).toBe("MCP connect");
      expect(error.cause).toBe("connection refused");
    });
  });
});
