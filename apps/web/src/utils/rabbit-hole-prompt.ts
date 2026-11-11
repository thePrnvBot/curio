/**
 * The wrap-up sends the digest back to the Director as a normal user turn.
 * That keeps the existing chat, persistence and course pipeline untouched,
 * but the raw prompt would render as a huge user bubble. These helpers turn
 * that prompt back into the compact card the learner should see.
 */

export type RabbitHolePromptTarget = "course" | "recap";

export interface RabbitHolePromptView {
  readonly digest: string;
  readonly takeaways: string;
  readonly target: RabbitHolePromptTarget;
}

const DIGEST_PATTERN =
  /<rabbit_hole_digest>\r?\n?(?<digest>[\s\S]*?)\r?\n?<\/rabbit_hole_digest>/u;
const TAKEAWAYS_PATTERN =
  /<learner_takeaways>\r?\n?(?<takeaways>[\s\S]*?)\r?\n?<\/learner_takeaways>/u;

export function parseRabbitHoleUserPrompt(
  text: string
): RabbitHolePromptView | null {
  const digestMatch = DIGEST_PATTERN.exec(text);
  const digest = digestMatch?.groups?.digest;
  if (digest === undefined) {
    return null;
  }
  const takeawaysMatch = TAKEAWAYS_PATTERN.exec(text);
  return {
    digest: digest.trim(),
    takeaways: (takeawaysMatch?.groups?.takeaways ?? "").trim(),
    target: text.includes("Build a course from this session")
      ? "course"
      : "recap",
  };
}
