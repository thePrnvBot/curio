import { tool } from "ai";
import type { ToolSet } from "ai";
import { Effect } from "effect";
import { z } from "zod";

import {
  searchLessonVideosEffect,
  verifyLessonVideoEffect,
} from "./lesson-video-search";
import type { LessonVideo } from "./lesson-video-search";

export const FIND_VIDEO_TOOL_NAME = "find_video";
export const VERIFY_VIDEO_TOOL_NAME = "verify_video";

function toToolVideo(video: LessonVideo): Record<string, unknown> {
  return {
    channel: video.channel,
    description:
      video.description === null ? null : video.description.slice(0, 500),
    durationSeconds: video.durationSeconds,
    publishedAt: video.publishedAt,
    title: video.title,
    url: video.videoUrl,
    views: video.views,
  };
}

/**
 * Video research for the Director. `find_video` returns only videos that
 * resolved against YouTube itself, with the popularity and provenance data the
 * Director needs before writing a video lesson; `verify_video` re-checks the
 * URL it finally intends to embed.
 */
export function createVideoTools(): ToolSet {
  return {
    [FIND_VIDEO_TOOL_NAME]: tool({
      description:
        "Find real, popular YouTube videos for a lesson topic. Returns verified candidates " +
        "with title, channel, view count, publish date and description. Call this BEFORE writing " +
        "any 'video' lesson: pick a candidate that is clearly on-topic, from a reputable channel, " +
        "and widely watched (prefer 100k+ views, ideally 1M+ for broad topics). Do not use video " +
        "URLs from anywhere else.",
      execute: async ({ query }) =>
        await Effect.runPromise(
          searchLessonVideosEffect(query).pipe(
            Effect.map((videos) => ({
              results: videos.map(toToolVideo),
            }))
          )
        ),
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .max(300)
          .describe(
            "What the lesson is about, e.g. 'React useEffect cleanup tutorial'"
          ),
      }),
    }),
    [VERIFY_VIDEO_TOOL_NAME]: tool({
      description:
        "Verify one candidate video URL before embedding it: confirms the video exists and is " +
        "playable, and reports its title, channel, view count, publish date and description. Use " +
        "it after find_video (or web_search) and check that the topic and facts match the lesson " +
        "before passing the URL as videoUrl.",
      execute: async ({ url }) =>
        await Effect.runPromise(
          verifyLessonVideoEffect(url).pipe(
            Effect.map(toToolVideo),
            Effect.catch((error) => Effect.succeed({ error: error.message }))
          )
        ),
      inputSchema: z.object({
        url: z
          .string()
          .min(8)
          .max(2000)
          .describe(
            "YouTube video URL to verify, taken from find_video or a web_search result"
          ),
      }),
    }),
  };
}
