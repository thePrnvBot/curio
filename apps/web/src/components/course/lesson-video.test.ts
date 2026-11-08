import { describe, expect, it } from "vitest";

import { toEmbeddableVideo } from "./lesson-video";

describe("toEmbeddableVideo", () => {
  it("turns YouTube watch URLs into no-cookie embeds", () => {
    expect(toEmbeddableVideo("https://www.youtube.com/watch?v=abc123")).toEqual(
      {
        kind: "iframe",
        url: "https://www.youtube-nocookie.com/embed/abc123",
      }
    );
  });

  it("handles youtu.be and shorts URLs", () => {
    expect(toEmbeddableVideo("https://youtu.be/xyz")).toEqual({
      kind: "iframe",
      url: "https://www.youtube-nocookie.com/embed/xyz",
    });
    expect(
      toEmbeddableVideo("https://youtube.com/shorts/xyz?feature=share")
    ).toEqual({
      kind: "iframe",
      url: "https://www.youtube-nocookie.com/embed/xyz",
    });
  });

  it("renders direct video files in a video element", () => {
    expect(toEmbeddableVideo("https://cdn.example.com/lesson.mp4")).toEqual({
      kind: "file",
      url: "https://cdn.example.com/lesson.mp4",
    });
  });

  it("keeps unknown hosts as iframes", () => {
    expect(toEmbeddableVideo("https://player.example.com/embed/1")).toEqual({
      kind: "iframe",
      url: "https://player.example.com/embed/1",
    });
  });

  it("rejects non-http URLs", () => {
    const dangerousUrl = `java${"script"}:alert(1)`;
    expect(toEmbeddableVideo(dangerousUrl)).toBeNull();
    expect(toEmbeddableVideo("not a url")).toBeNull();
  });
});
