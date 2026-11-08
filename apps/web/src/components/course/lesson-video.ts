/** How a Director-provided video URL should be rendered. */
export type EmbeddableVideo =
  | { readonly kind: "file"; readonly url: string }
  | { readonly kind: "iframe"; readonly url: string };

const DIRECT_VIDEO_PATTERN = /\.(?:mp4|webm|ogv|ogg|mov)(?:[?#]|$)/iu;

function safeUrl(candidate: string): URL | null {
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

/**
 * Normalizes watch/share URLs into embeddable URLs. Unknown hosts fall back
 * to the original URL in an iframe; non-http(s) and unparseable values are
 * rejected so the lesson never renders a `javascript:` frame.
 */
export function toEmbeddableVideo(videoUrl: string): EmbeddableVideo | null {
  const parsed = safeUrl(videoUrl);
  if (parsed === null || !["http:", "https:"].includes(parsed.protocol)) {
    return null;
  }
  if (DIRECT_VIDEO_PATTERN.test(parsed.pathname)) {
    return { kind: "file", url: parsed.toString() };
  }

  const host = parsed.hostname.replace(/^www\./u, "").toLowerCase();
  if (host === "youtu.be") {
    const [videoId] = parsed.pathname.slice(1).split("/");
    return videoId === undefined || videoId === ""
      ? null
      : {
          kind: "iframe",
          url: `https://www.youtube-nocookie.com/embed/${videoId}`,
        };
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    const videoId =
      parsed.searchParams.get("v") ??
      parsed.pathname.match(/^\/(?:embed|shorts)\/(?<videoId>[^/?#]+)/u)?.groups
        ?.videoId;
    return videoId === undefined || videoId === null || videoId === ""
      ? null
      : {
          kind: "iframe",
          url: `https://www.youtube-nocookie.com/embed/${videoId}`,
        };
  }
  if (host === "vimeo.com") {
    const videoId =
      parsed.pathname.match(/^\/(?<videoId>\d+)/u)?.groups?.videoId;
    return videoId === undefined
      ? null
      : { kind: "iframe", url: `https://player.vimeo.com/video/${videoId}` };
  }

  return { kind: "iframe", url: parsed.toString() };
}
