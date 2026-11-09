import { Option } from "effect";
import { describe, expect, it } from "vitest";

import { toArtifactData, toArtifactRenderPlan } from "./chat-schemas";

describe("toArtifactData", () => {
  it("keeps a published artifact with an explicit media type", () => {
    const decoded = toArtifactData({
      content: "<h1>Hi</h1>",
      mediaType: "text/html",
      title: "Page",
    });
    expect(Option.isSome(decoded)).toBe(true);
    if (Option.isSome(decoded)) {
      expect(decoded.value.mediaType).toBe("text/html");
      expect(Option.getOrNull(decoded.value.title)).toBe("Page");
    }
  });

  it("infers the media type from a tool input filename", () => {
    const decoded = toArtifactData({
      content: "# Notes",
      filename: "notes.md",
    });
    expect(Option.isSome(decoded)).toBe(true);
    if (Option.isSome(decoded)) {
      expect(decoded.value.mediaType).toBe("text/markdown");
    }
  });

  it("falls back to plain text for unknown or missing hints", () => {
    const decoded = toArtifactData({ content: "hello", filename: "notes.xyz" });
    expect(Option.isSome(decoded)).toBe(true);
    if (Option.isSome(decoded)) {
      expect(decoded.value.mediaType).toBe("text/plain");
    }
  });

  it("rejects payloads without content", () => {
    expect(Option.isNone(toArtifactData({ title: "Only a title" }))).toBe(true);
  });
});

describe("toArtifactRenderPlan", () => {
  it("classifies known media types", () => {
    expect(toArtifactRenderPlan("text/html").kind).toBe("embed");
    expect(toArtifactRenderPlan("image/svg+xml").kind).toBe("svg");
    expect(toArtifactRenderPlan("text/markdown").kind).toBe("markdown");
    expect(toArtifactRenderPlan("application/json").kind).toBe("code");
  });

  it("degrades unknown media types to plain", () => {
    expect(toArtifactRenderPlan("application/pdf")).toEqual({ kind: "plain" });
  });
});
