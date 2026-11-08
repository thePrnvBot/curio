import { describe, expect, it } from "vitest";

import type { GeneratedArtifactResponseView } from "@/utils/chat-schemas";

import type { ArtifactButtonState } from "./chat-artifact-button-state";
import { artifactButtonReducer } from "./chat-artifact-button-state";

const dummyArtifact: GeneratedArtifactResponseView = {
  brief: {
    content: "content",
    mediaType: "text/html",
    summary: "summary",
    title: "Artifact",
  },
  links: { review: "https://example.com" },
};

describe("artifactButtonReducer", () => {
  it("transitions from idle to generating on start", () => {
    const next = artifactButtonReducer({ kind: "idle" }, { type: "start" });
    expect(next).toEqual({ kind: "generating" });
  });

  it("ignores unexpected actions in idle", () => {
    const state: ArtifactButtonState = { kind: "idle" };
    expect(artifactButtonReducer(state, { type: "reset" })).toBe(state);
    expect(
      artifactButtonReducer(state, { type: "published", artifact: dummyArtifact })
    ).toBe(state);
    expect(
      artifactButtonReducer(state, { type: "error", message: "fail" })
    ).toBe(state);
  });

  it("transitions from generating to published", () => {
    const next = artifactButtonReducer(
      { kind: "generating" },
      { type: "published", artifact: dummyArtifact }
    );
    expect(next).toEqual({ kind: "published", artifact: dummyArtifact });
  });

  it("transitions from generating to error", () => {
    const next = artifactButtonReducer(
      { kind: "generating" },
      { type: "error", message: "Generation failed" }
    );
    expect(next).toEqual({ kind: "error", message: "Generation failed" });
  });

  it("ignores start while already generating", () => {
    const state: ArtifactButtonState = { kind: "generating" };
    expect(artifactButtonReducer(state, { type: "start" })).toBe(state);
  });

  it("resets published state to idle", () => {
    const next = artifactButtonReducer(
      { kind: "published", artifact: dummyArtifact },
      { type: "reset" }
    );
    expect(next).toEqual({ kind: "idle" });
  });

  it("resets error state to idle", () => {
    const next = artifactButtonReducer(
      { kind: "error", message: "fail" },
      { type: "reset" }
    );
    expect(next).toEqual({ kind: "idle" });
  });

  it("ignores actions from terminal states other than reset", () => {
    const published: ArtifactButtonState = {
      kind: "published",
      artifact: dummyArtifact,
    };
    expect(artifactButtonReducer(published, { type: "start" })).toBe(published);
    expect(
      artifactButtonReducer(published, { type: "published", artifact: dummyArtifact })
    ).toBe(published);

    const error: ArtifactButtonState = { kind: "error", message: "fail" };
    expect(artifactButtonReducer(error, { type: "start" })).toBe(error);
    expect(artifactButtonReducer(error, { type: "error", message: "other" })).toBe(
      error
    );
  });
});
