import type {
  RabbitHoleDigestResult,
  RabbitHoleHighlight,
  RabbitHoleNote,
  RabbitHolePageSummary,
  RabbitHoleStats,
  RabbitHoleVisit,
} from "./types";

/**
 * Deterministic session digest. This is the always-available baseline: it is
 * built without a model so a failed model call can never lose the session.
 * The end-of-session route may replace `digest` with a model-written version
 * grounded in exactly this text.
 */

const MAX_DIGEST_CHARS = 14_000;
const MIN_EXCERPT_CHARS = 120;
const MAX_EXCERPT_CHARS = 1500;
const NOTES_RESERVE_CHARS = 2400;

export interface RabbitHoleDigestInput {
  readonly endedAt: number;
  readonly highlights: readonly RabbitHoleHighlight[];
  readonly notes: readonly RabbitHoleNote[];
  readonly startedAt: number;
  readonly topic: string | null;
  readonly visits: readonly RabbitHoleVisit[];
}

function oneLine(value: string, limit: number): string {
  const normalized = value.replaceAll(/\s+/gu, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function uniqueMediaCount(visits: readonly RabbitHoleVisit[]): number {
  const urls = new Set<string>();
  for (const visit of visits) {
    for (const media of visit.media) {
      urls.add(media.url);
    }
  }
  return urls.size;
}

function pageSummaries(
  visits: readonly RabbitHoleVisit[],
  notes: readonly RabbitHoleNote[],
  highlights: readonly RabbitHoleHighlight[]
): readonly RabbitHolePageSummary[] {
  return visits.map((visit) => ({
    dwellMs: visit.dwellMs,
    highlightCount: highlights.filter((entry) => entry.url === visit.url)
      .length,
    id: visit.id,
    mediaCount: visit.media.length,
    noteCount: notes.filter((entry) => entry.url === visit.url).length,
    scrollDepth: visit.scrollDepth,
    title: visit.title === "" ? visit.url : visit.title,
    url: visit.url,
  }));
}

/** `12 min` / `48 sec` for the header line. */
function describeDuration(durationMs: number): string {
  const minutes = Math.round(durationMs / 60_000);
  if (minutes >= 1) {
    return `${minutes} min`;
  }
  return `${Math.max(0, Math.round(durationMs / 1000))} sec`;
}

function percent(value: number): string {
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

function excerptLimitFor(visitCount: number): number {
  if (visitCount === 0) {
    return MIN_EXCERPT_CHARS;
  }
  const budget = Math.floor(
    (MAX_DIGEST_CHARS - NOTES_RESERVE_CHARS) / visitCount
  );
  return Math.min(MAX_EXCERPT_CHARS, Math.max(MIN_EXCERPT_CHARS, budget));
}

function rabbitHoleUrlLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return url;
  }
}

function visitSection(
  visit: RabbitHoleVisit,
  index: number,
  excerptLimit: number,
  notes: readonly RabbitHoleNote[],
  highlights: readonly RabbitHoleHighlight[]
): string {
  const title = oneLine(
    visit.title === "" ? rabbitHoleUrlLabel(visit.url) : visit.title,
    160
  );
  const lines: string[] = [
    `### ${index + 1}. ${title}`,
    visit.url,
    `Time on page: ${describeDuration(visit.dwellMs)} · scrolled ${percent(visit.scrollDepth)}`,
  ];
  if (visit.excerpt !== "") {
    lines.push(`> ${oneLine(visit.excerpt, excerptLimit)}`);
  }
  if (visit.media.length > 0) {
    const media = visit.media
      .slice(0, 6)
      .map((entry) => `${entry.kind}: ${entry.title ?? entry.url}`)
      .join("; ");
    lines.push(`Media: ${media}`);
  }
  const visitNotes = notes.filter((note) => note.url === visit.url);
  for (const note of visitNotes) {
    lines.push(`Learner note: ${oneLine(note.text, 500)}`);
  }
  const visitHighlights = highlights.filter(
    (highlight) => highlight.url === visit.url
  );
  for (const highlight of visitHighlights) {
    lines.push(`Highlighted: “${oneLine(highlight.quote, 400)}”`);
  }
  return lines.join("\n");
}

/** Builds the digest text plus the numbers the wrap-up card shows. */
export function buildRabbitHoleDigest(
  input: RabbitHoleDigestInput
): RabbitHoleDigestResult {
  const visits = input.visits.filter(
    (visit) => visit.url !== "" && !visit.url.startsWith("about:")
  );
  const visitedUrls = new Set(visits.map((visit) => visit.url));
  const stats: RabbitHoleStats = {
    durationMs: Math.max(0, input.endedAt - input.startedAt),
    highlights: input.highlights.length,
    media: uniqueMediaCount(visits),
    notes: input.notes.length,
    pages: visits.length,
  };

  if (visits.length === 0) {
    return {
      digest:
        "# Rabbit Hole\n\nNo pages were opened before the session ended. Start another session and the trail will land here.",
      pages: [],
      stats,
      topic: input.topic,
    };
  }

  const excerptLimit = excerptLimitFor(visits.length);
  const header = [
    `# Rabbit Hole — ${oneLine(input.topic ?? "open exploration", 160)}`,
    "",
    `${stats.pages} pages · ${describeDuration(stats.durationMs)} · ${stats.notes} notes · ${stats.highlights} highlights · ${stats.media} media items`,
    "",
    "## Trail",
  ].join("\n");

  const sections = visits
    .map((visit, index) =>
      visitSection(visit, index, excerptLimit, input.notes, input.highlights)
    )
    .join("\n\n");

  const notesOutsideTrail = input.notes.filter(
    (note) => !visitedUrls.has(note.url)
  );
  const highlightsOutsideTrail = input.highlights.filter(
    (highlight) => !visitedUrls.has(highlight.url)
  );

  const extras: string[] = [];
  if (notesOutsideTrail.length > 0) {
    extras.push(
      [
        "## Other notes",
        ...notesOutsideTrail.map(
          (note) => `- ${oneLine(note.text, 500)} (${note.title || note.url})`
        ),
      ].join("\n")
    );
  }
  if (highlightsOutsideTrail.length > 0) {
    extras.push(
      [
        "## Other highlights",
        ...highlightsOutsideTrail.map(
          (highlight) =>
            `- “${oneLine(highlight.quote, 400)}” — ${highlight.title || highlight.url}`
        ),
      ].join("\n")
    );
  }

  const digest = [
    header,
    sections,
    ...(extras.length === 0 ? [] : [extras.join("\n\n")]),
  ].join("\n\n");
  return {
    digest:
      digest.length <= MAX_DIGEST_CHARS
        ? digest
        : `${digest.slice(0, MAX_DIGEST_CHARS).trimEnd()}\n\n[digest truncated]`,
    pages: pageSummaries(visits, input.notes, input.highlights),
    stats,
    topic: input.topic,
  };
}

/** Prompt wrapper for the recap/course turn the learner chooses at the end. */
export function buildRabbitHoleFollowUpPrompt({
  digest,
  takeaways,
  target,
}: {
  readonly digest: string;
  readonly takeaways: string;
  readonly target: "recap" | "course";
}): string {
  const takeawayBlock =
    takeaways.trim() === ""
      ? "No explicit takeaways: focus on the thread I actually followed and the pages I spent the most time on."
      : takeaways.trim();

  if (target === "recap") {
    return [
      "My Rabbit Hole session just ended. Here is the captured digest:",
      "<rabbit_hole_digest>",
      digest,
      "</rabbit_hole_digest>",
      "",
      "What mattered most to me:",
      "<learner_takeaways>",
      takeawayBlock,
      "</learner_takeaways>",
      "",
      "Write recap notes for me in markdown, directly in this chat reply: a short overview of the thread I followed, the key ideas from each page as tight bullets with the page linked, the connections between sources, and 4-6 things worth remembering. Prioritise the parts that match my takeaways and call out anything the pages disagreed on. Do not invent sources or facts that are not in the digest. Do not call create_artifact and do not build a course.",
    ].join("\n");
  }

  return [
    "My Rabbit Hole session just ended. Here is the captured digest:",
    "<rabbit_hole_digest>",
    digest,
    "</rabbit_hole_digest>",
    "",
    "What mattered most to me:",
    "<learner_takeaways>",
    takeawayBlock,
    "</learner_takeaways>",
    "",
    "Build a course from this session. I have already chosen the course path, so skip the ask_user preference questions and go straight to create_course, then fill every lesson with create_lesson. Ground the lessons in the pages above, prioritise what matches my takeaways, and cite the source pages in the lesson prose. Do not call create_artifact.",
  ].join("\n");
}
