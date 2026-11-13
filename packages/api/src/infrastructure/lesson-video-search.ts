import { Data, Effect } from "effect";

import { duckDuckGoSearchEffect } from "./web-search";

/**
 * Lesson video research: finds candidate YouTube videos through the existing
 * DuckDuckGo search tier, then verifies each candidate against YouTube itself
 * before it is ever offered to the Director or embedded in a lesson. Nothing
 * here trusts a URL the model typed: only ids that resolve to a real,
 * playable video are returned.
 */

export interface LessonVideo {
  readonly channel: string;
  readonly description: string | null;
  readonly durationSeconds: number | null;
  readonly publishedAt: string | null;
  readonly title: string;
  readonly videoUrl: string;
  /** Total view count; null when YouTube did not expose it. */
  readonly views: number | null;
}

export class LessonVideoLookupFailed extends Data.TaggedError(
  "LessonVideoLookupFailed"
)<{
  readonly cause: unknown;
  readonly url: string;
}> {
  override get message(): string {
    const detail =
      this.cause instanceof Error ? this.cause.message : String(this.cause);
    return `Video verification failed for ${this.url}: ${detail}`;
  }
}

/* -------------------------------- Pure helpers ---------------------------- */

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/u;

/**
 * Normalizes every common YouTube URL shape (watch, share, shorts, embed,
 * live, music) to a canonical watch URL. Anything that is not a YouTube video
 * id is rejected, so a stray channel/playlist/search link never becomes a
 * lesson embed.
 */
export function normalizeYouTubeVideoUrl(candidate: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(candidate.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./u, "").toLowerCase();

  let videoId: string | null = null;
  if (host === "youtu.be") {
    videoId = parsed.pathname.slice(1).split("/")[0] ?? null;
  } else if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com"
  ) {
    videoId =
      parsed.searchParams.get("v") ??
      parsed.pathname.match(/^\/(?:embed|shorts|live|v)\/(?<videoId>[^/?#]+)/u)
        ?.groups?.videoId ??
      null;
  }

  if (videoId === null || !YOUTUBE_ID_PATTERN.test(videoId)) {
    return null;
  }
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Extracts the balanced JSON object that follows `marker` in an HTML page.
 * YouTube inlines its player payload that way; a naive `indexOf("</script>")`
 * would cut long JSON off, so braces are counted outside string literals.
 */
export function extractJsonObjectAfter(
  source: string,
  marker: string
): string | null {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    return null;
  }
  const start = source.indexOf("{", markerIndex + marker.length);
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = inString;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  return null;
}

interface YouTubePlayerResponse {
  readonly playabilityStatus?: { readonly status?: string };
  readonly videoDetails?: {
    readonly author?: string;
    readonly isLiveContent?: boolean;
    readonly lengthSeconds?: string;
    readonly shortDescription?: string;
    readonly title?: string;
    readonly videoId?: string;
    readonly viewCount?: string;
  };
  readonly microformat?: {
    readonly playerMicroformatRenderer?: {
      readonly publishDate?: string;
      readonly uploadDate?: string;
    };
  };
}

function toCount(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }
  const numeric = Number(value.replaceAll(",", ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function parsePlayerResponse(html: string): YouTubePlayerResponse | null {
  const json = extractJsonObjectAfter(html, "ytInitialPlayerResponse");
  if (json === null) {
    return null;
  }
  try {
    return JSON.parse(json) as YouTubePlayerResponse;
  } catch {
    return null;
  }
}

/**
 * Reads the server-rendered player payload of a YouTube watch page. Returns
 * null when the page is a consent wall, a bot challenge, or the video is not
 * playable — callers must treat that as "unverified".
 */
export function parseYouTubeWatchMetadata(
  html: string
): Omit<LessonVideo, "videoUrl"> | null {
  const player = parsePlayerResponse(html);
  if (player === null) {
    return null;
  }
  const details = player.videoDetails;
  if (
    player.playabilityStatus?.status !== "OK" ||
    details?.title === undefined ||
    details.title === "" ||
    details.author === undefined ||
    details.isLiveContent === true
  ) {
    return null;
  }
  return {
    channel: details.author,
    description: details.shortDescription?.trim() || null,
    durationSeconds: toCount(details.lengthSeconds),
    publishedAt:
      player.microformat?.playerMicroformatRenderer?.publishDate ??
      player.microformat?.playerMicroformatRenderer?.uploadDate ??
      null,
    title: details.title,
    views: toCount(details.viewCount),
  };
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "from",
  "how",
  "in",
  "intro",
  "introduction",
  "of",
  "on",
  "the",
  "to",
  "tutorial",
  "video",
  "what",
  "with",
]);

function keywords(text: string): readonly string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#]+/u)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

/** Overlap between the lesson topic and the video title, 0..1. */
export function videoTitleRelevance(title: string, query: string): number {
  const queryWords = new Set(keywords(query));
  if (queryWords.size === 0) {
    return 0;
  }
  const titleWords = new Set(keywords(title));
  let matched = 0;
  for (const word of queryWords) {
    if (titleWords.has(word)) {
      matched += 1;
    }
  }
  return matched / queryWords.size;
}

/**
 * Ranks candidates the way a learner would: popular first, but a viral
 * off-topic result must not outrank a slightly smaller on-topic lesson.
 * Very short clips are teaching dead ends and get demoted.
 */
function lessonVideoScore(video: LessonVideo, query: string): number {
  const popularity = Math.log10((video.views ?? 0) + 10);
  const relevance = videoTitleRelevance(video.title, query) * 3;
  const shortClip =
    video.durationSeconds !== null && video.durationSeconds < 120 ? 1.5 : 0;
  return popularity + relevance - shortClip;
}

export function rankLessonVideos(
  candidates: readonly LessonVideo[],
  query: string
): readonly LessonVideo[] {
  return candidates.toSorted(
    (left, right) =>
      lessonVideoScore(right, query) - lessonVideoScore(left, query)
  );
}

/** Query for the background lesson generator: topic plus course context. */
export function lessonVideoQuery({
  courseTitle,
  targetTitle,
}: {
  readonly courseTitle: string;
  readonly targetTitle: string;
}): string {
  return `${targetTitle} ${courseTitle}`.trim();
}

/* ------------------------------- Verification ------------------------------ */

const YOUTUBE_TIMEOUT_MS = 15_000;
const YOUTUBE_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const fetchYouTubeText = (
  url: string
): Effect.Effect<string, LessonVideoLookupFailed> =>
  Effect.tryPromise({
    catch: (error) => new LessonVideoLookupFailed({ cause: error, url }),
    try: async () => {
      const response = await fetch(url, {
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          // Skip the EU consent interstitial so the player payload is present.
          Cookie: "CONSENT=YES+cb.20210328-17-p0.en+FX+123",
          "User-Agent": YOUTUBE_USER_AGENT,
        },
        signal: AbortSignal.timeout(YOUTUBE_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`YouTube responded ${response.status}`);
      }
      return await response.text();
    },
  });

interface OEmbedPayload {
  readonly author_name?: string;
  readonly title?: string;
}

/**
 * Verifies one candidate URL against YouTube. The watch page supplies view
 * count, publish date and description (popularity + topical evidence); the
 * oEmbed endpoint is the fallback that still proves the video exists.
 */
export const verifyLessonVideoEffect = Effect.fnUntraced(
  function* verifyLessonVideoEffect(
    candidate: string
  ): Effect.fn.Return<LessonVideo, LessonVideoLookupFailed> {
    const videoUrl = normalizeYouTubeVideoUrl(candidate);
    if (videoUrl === null) {
      return yield* Effect.fail(
        new LessonVideoLookupFailed({
          cause: "Not a YouTube video URL",
          url: candidate,
        })
      );
    }

    const html = yield* fetchYouTubeText(videoUrl);
    const metadata = parseYouTubeWatchMetadata(html);
    if (metadata !== null) {
      return { ...metadata, videoUrl };
    }

    const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      videoUrl
    )}&format=json`;
    const oEmbedText = yield* fetchYouTubeText(oEmbedUrl);
    let oEmbed: OEmbedPayload;
    try {
      oEmbed = JSON.parse(oEmbedText) as OEmbedPayload;
    } catch (error) {
      return yield* Effect.fail(
        new LessonVideoLookupFailed({ cause: error, url: videoUrl })
      );
    }
    if (oEmbed.title === undefined || oEmbed.author_name === undefined) {
      return yield* Effect.fail(
        new LessonVideoLookupFailed({
          cause: "Video is unavailable or not embeddable",
          url: videoUrl,
        })
      );
    }
    return {
      channel: oEmbed.author_name,
      description: null,
      durationSeconds: null,
      publishedAt: null,
      title: oEmbed.title,
      videoUrl,
      views: null,
    };
  }
);

const SEARCH_RESULT_LIMIT = 8;
const MAX_CANDIDATES = 6;
const MAX_RESULTS = 5;

/**
 * Finds popular, embeddable videos for a lesson topic. Search is restricted to
 * YouTube, every hit is verified individually, and failures degrade to an
 * empty list so lesson generation never fails because research was flaky.
 */
export const searchLessonVideosEffect = Effect.fnUntraced(
  function* searchLessonVideosEffect(
    query: string
  ): Effect.fn.Return<readonly LessonVideo[]> {
    const searchOutcome = yield* duckDuckGoSearchEffect(
      `site:youtube.com ${query}`,
      SEARCH_RESULT_LIMIT,
      "any"
    ).pipe(Effect.catch(() => Effect.succeed({ blocked: false, results: [] })));

    const urls = [
      ...new Set(
        searchOutcome.results
          .map((result) => normalizeYouTubeVideoUrl(result.url))
          .filter((url): url is string => url !== null)
      ),
    ].slice(0, MAX_CANDIDATES);
    if (urls.length === 0) {
      return [];
    }

    const verifications = yield* Effect.forEach(
      urls,
      (url) => Effect.result(verifyLessonVideoEffect(url)),
      { concurrency: 3 }
    );
    const verified = verifications.flatMap((verification) =>
      verification._tag === "Success" ? [verification.success] : []
    );
    return rankLessonVideos(verified, query).slice(0, MAX_RESULTS);
  }
);
