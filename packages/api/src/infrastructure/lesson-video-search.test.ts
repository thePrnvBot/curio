import { describe, expect, it } from "vitest";

import {
  extractJsonObjectAfter,
  lessonVideoQuery,
  normalizeYouTubeVideoUrl,
  parseYouTubeWatchMetadata,
  rankLessonVideos,
  videoTitleRelevance,
} from "./lesson-video-search";
import type { LessonVideo } from "./lesson-video-search";

describe("normalizeYouTubeVideoUrl", () => {
  it("normalizes every common YouTube URL shape", () => {
    expect(
      normalizeYouTubeVideoUrl("https://www.youtube.com/watch?v=abc123")
    ).toBe("https://www.youtube.com/watch?v=abc123");
    expect(normalizeYouTubeVideoUrl("https://youtu.be/xyz789")).toBe(
      "https://www.youtube.com/watch?v=xyz789"
    );
    expect(
      normalizeYouTubeVideoUrl(
        "https://youtube.com/shorts/xyz789?feature=share"
      )
    ).toBe("https://www.youtube.com/watch?v=xyz789");
    expect(
      normalizeYouTubeVideoUrl("https://www.youtube.com/embed/xyz789")
    ).toBe("https://www.youtube.com/watch?v=xyz789");
    expect(
      normalizeYouTubeVideoUrl("https://music.youtube.com/watch?v=xyz789")
    ).toBe("https://www.youtube.com/watch?v=xyz789");
  });

  it("rejects links that are not a single video", () => {
    expect(
      normalizeYouTubeVideoUrl("https://www.youtube.com/@somechannel")
    ).toBeNull();
    expect(
      normalizeYouTubeVideoUrl("https://www.youtube.com/playlist?list=PL123")
    ).toBeNull();
    expect(
      normalizeYouTubeVideoUrl("https://www.youtube.com/watch?v=short")
    ).toBeNull();
    expect(normalizeYouTubeVideoUrl("ftp://example.com/video.mp4")).toBeNull();
    expect(normalizeYouTubeVideoUrl("not a url")).toBeNull();
  });
});

describe("extractJsonObjectAfter", () => {
  it("keeps nested braces that appear inside strings", () => {
    const source = `var ytInitialPlayerResponse = {"title":"a } b { c","nested":{"ok":true}}; var next = 1;`;
    expect(extractJsonObjectAfter(source, "ytInitialPlayerResponse")).toBe(
      '{"title":"a } b { c","nested":{"ok":true}}'
    );
  });

  it("returns null when the marker or object is missing", () => {
    expect(
      extractJsonObjectAfter("nothing here", "ytInitialPlayerResponse")
    ).toBeNull();
    expect(
      extractJsonObjectAfter(
        "var ytInitialPlayerResponse = ;",
        "ytInitialPlayerResponse"
      )
    ).toBeNull();
  });
});

describe("parseYouTubeWatchMetadata", () => {
  const html = `<script>var ytInitialPlayerResponse = ${JSON.stringify({
    microformat: {
      playerMicroformatRenderer: { publishDate: "2022-05-01" },
    },
    playabilityStatus: { status: "OK" },
    videoDetails: {
      author: "Acme Dev",
      isLiveContent: false,
      lengthSeconds: "615",
      shortDescription: "A hands-on walkthrough.",
      title: "React Hooks Tutorial",
      viewCount: "1200000",
    },
  })};</script>`;

  it("reads views, channel, date and description", () => {
    expect(parseYouTubeWatchMetadata(html)).toStrictEqual({
      channel: "Acme Dev",
      description: "A hands-on walkthrough.",
      durationSeconds: 615,
      publishedAt: "2022-05-01",
      title: "React Hooks Tutorial",
      views: 1_200_000,
    });
  });

  it("rejects unplayable and live pages", () => {
    expect(
      parseYouTubeWatchMetadata(
        '<script>var ytInitialPlayerResponse = {"playabilityStatus":{"status":"ERROR"}};</script>'
      )
    ).toBeNull();
    expect(
      parseYouTubeWatchMetadata(
        '<script>var ytInitialPlayerResponse = {"playabilityStatus":{"status":"OK"},"videoDetails":{"title":"Live","author":"A","isLiveContent":true}};</script>'
      )
    ).toBeNull();
    expect(parseYouTubeWatchMetadata("<html>consent</html>")).toBeNull();
  });
});

function lessonVideo(
  overrides: Partial<LessonVideo> & { readonly title: string }
): LessonVideo {
  return {
    channel: "Acme",
    description: null,
    durationSeconds: 600,
    publishedAt: null,
    videoUrl: "https://www.youtube.com/watch?v=abcdef",
    views: null,
    ...overrides,
  };
}

describe("video ranking", () => {
  it("scores title overlap between the query and the video", () => {
    expect(videoTitleRelevance("React Hooks Tutorial", "react hooks")).toBe(1);
    expect(videoTitleRelevance("Kubernetes Crash Course", "react hooks")).toBe(
      0
    );
  });

  it("puts an on-topic popular video above a viral off-topic one", () => {
    const ranked = rankLessonVideos(
      [
        lessonVideo({ title: "Funny cats compilation", views: 50_000_000 }),
        lessonVideo({ title: "React Hooks deep dive", views: 1_000_000 }),
      ],
      "react hooks"
    );
    expect(ranked[0]?.title).toBe("React Hooks deep dive");
  });

  it("demotes very short clips and falls back to the most viewed", () => {
    const ranked = rankLessonVideos(
      [
        lessonVideo({
          durationSeconds: 30,
          title: "React Hooks in 30s",
          views: 5_000_000,
        }),
        lessonVideo({ title: "React Hooks course", views: 200_000 }),
      ],
      "react hooks"
    );
    expect(ranked[0]?.title).toBe("React Hooks course");
  });
});

describe("lessonVideoQuery", () => {
  it("combines the lesson topic with the course context", () => {
    expect(
      lessonVideoQuery({
        courseTitle: "React Fundamentals",
        targetTitle: "Using useEffect",
      })
    ).toBe("Using useEffect React Fundamentals");
  });
});
