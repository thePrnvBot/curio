import { describe, expect, it } from "vitest";

import type { ArtifactPublicationInput, GeneratedArtifactBrief } from "./artifact";

describe("artifact domain types", () => {
  it("can construct a generated artifact brief", () => {
    const brief: GeneratedArtifactBrief = {
      title: "My App",
      filename: "index.html",
      mediaType: "text/html",
      content: "<h1>Hello</h1>",
      summary: "A simple HTML artifact.",
    };

    expect(brief.filename).toBe("index.html");
    expect(brief.mediaType).toBe("text/html");
  });

  it("can construct an artifact publication input", () => {
    const input: ArtifactPublicationInput = {
      title: "My App",
      entryFilename: "index.html",
      content: "<h1>Hello</h1>",
      mediaType: "text/html",
    };

    expect(input.entryFilename).toBe("index.html");
  });
});
