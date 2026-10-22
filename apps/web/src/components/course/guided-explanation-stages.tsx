import { highlightCode } from "@curio/ui/components/ai-elements/code-block";
import type {
  BundledLanguage,
  ThemedToken,
  TokenizedCode,
} from "@curio/ui/components/ai-elements/code-block";
import { MessageResponse } from "@curio/ui/components/ai-elements/message";
import type { Variants } from "motion/react";
import { useEffect, useState } from "react";
import type { CSSProperties, ReactElement } from "react";

interface GuidedStageLine {
  readonly spans: readonly {
    readonly content: string;
    readonly style?: CSSProperties;
  }[];
}

/** A highlighted stage's tokens reshaped for rendering. */
interface GuidedTokens {
  readonly bg: string;
  readonly fg: string;
  readonly lines: GuidedStageLine[];
}

/** Effect-Institute-style stage transitions: the incoming visual slides up
 * from the narration direction with a blur-fade, the outgoing one lifts away.
 * Mirrored when stepping backwards. */
export const stageVariants: Variants = {
  enter: (direction: number) => ({
    opacity: 0,
    y: 26 * direction,
    filter: "blur(6px)",
  }),
  center: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] },
  },
  exit: (direction: number) => ({
    opacity: 0,
    y: -20 * direction,
    filter: "blur(4px)",
    transition: { duration: 0.22, ease: [0.4, 0, 1, 1] },
  }),
};

/** Reduced motion: crossfade only, no travel. */
export const reducedStageVariants: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

/** The Director may omit a step's language; guess from the source instead of
 * falling straight to "text", which removes all syntax color. The result is
 * a best-effort hint: highlightCode degrades unknown names to plain. */
export function guidedCodeLanguageHint(
  language: string | undefined,
  source: string
): string {
  const aliases: Record<string, string> = {
    cjs: "javascript",
    go: "go",
    js: "javascript",
    jsx: "jsx",
    mjs: "javascript",
    shell: "bash",
    sh: "bash",
    ts: "typescript",
    tsx: "tsx",
    yml: "yaml",
    zsh: "bash",
  };
  const languageHint = language?.trim().toLowerCase();
  if (languageHint !== undefined && languageHint !== "") {
    return aliases[languageHint] ?? languageHint;
  }
  if (/\bdef\s+\w+\s*\(|:\s*$/mu.test(source) && !/[;{]\s*$/mu.test(source)) {
    return "python";
  }
  if (
    /^\s*(?:CREATE TABLE|INSERT INTO|SELECT\s|UPDATE\s|ALTER TABLE)/imu.test(
      source
    )
  ) {
    return "sql";
  }
  if (
    source.startsWith("#!") ||
    /^\s*(?:cd |sudo |npm |pnpm |yarn |git |curl |echo )/mu.test(source)
  ) {
    return "bash";
  }
  if (
    /^\s*(?:const |let |import |export |function |async function)/mu.test(
      source
    ) ||
    source.includes("=>")
  ) {
    return "typescript";
  }
  if (/\bfunc\s+\w+\s*\(/u.test(source)) {
    return "go";
  }
  if (/\bfn\s+\w+\s*\(|\blet\s+mut\s/u.test(source)) {
    return "rust";
  }
  if (/\{\s*"[^"]*"\s*:/u.test(source)) {
    return "json";
  }
  return "text";
}

/** Maps a shiki token's bitflag font styles onto CSS properties. */
function tokenStyle(token: ThemedToken): CSSProperties {
  // Shiki stores font styles as a bitfield: 1=italic, 2=bold, 4=underline.
  // oxlint-disable-next-line no-bitwise -- the flags genuinely are bits
  let fontStyle: "italic" | undefined;
  let fontWeight: "bold" | undefined;
  let textDecoration: "underline" | undefined;
  // oxlint-disable-next-line no-bitwise -- bitfield test
  if ((token.fontStyle ?? 0) & 1) {
    fontStyle = "italic";
  }
  // oxlint-disable-next-line no-bitwise -- bitfield test
  if ((token.fontStyle ?? 0) & 2) {
    fontWeight = "bold";
  }
  // oxlint-disable-next-line no-bitwise -- bitfield test
  if ((token.fontStyle ?? 0) & 4) {
    textDecoration = "underline";
  }
  return {
    backgroundColor: token.bgColor,
    color: token.color,
    fontStyle,
    fontWeight,
    textDecoration,
    ...token.htmlStyle,
  } as CSSProperties;
}

/** Code stage with shiki highlighting and staggered line-in motion. Uses the
 * shared highlighter cache from the CodeBlock module; falls back to plain
 * monospace until tokens are ready, identical layout either way. */
export function GuidedCodeStage(props: {
  source: string;
  language: string;
}): ReactElement {
  const [highlighted, setHighlighted] = useState<GuidedTokens | null>(null);

  useEffect(() => {
    let cancelled = false;
    const applyTokens = (result: TokenizedCode): void => {
      if (cancelled) {
        return;
      }
      setHighlighted({
        bg: result.bg,
        fg: result.fg,
        lines: result.tokens.map((line) => ({
          spans: line.map((token) => ({
            content: token.content,
            style: tokenStyle(token),
          })),
        })),
      });
    };
    // highlightCode is a sync-cache + async-callback API: a cache hit
    // returns the tokens WITHOUT invoking the callback, so the sync result
    // must be consumed here too (otherwise revisited steps lose all
    // highlighting).
    const cachedTokens = highlightCode(
      props.source,
      // highlightCode accepts only shiki's bundled languages, and the plain
      // fallback "text" is not one of them. The hint above is already a
      // best-effort guess, so this stays a documented boundary cast.
      props.language as BundledLanguage
    );
    if (cachedTokens !== null) {
      applyTokens(cachedTokens);
    }
    highlightCode(props.source, props.language as BundledLanguage, applyTokens);
    return () => {
      cancelled = true;
    };
  }, [props.language, props.source]);

  const fallbackLines: GuidedStageLine[] = props.source
    .split("\n")
    .map((line) => ({ spans: [{ content: line }] }));

  const lines = highlighted === null ? fallbackLines : highlighted.lines;

  return (
    <pre
      className="overflow-x-auto p-4 font-mono text-sm leading-6 dark:!bg-[var(--shiki-dark-bg)] dark:!text-[var(--shiki-dark)]"
      style={
        highlighted === null
          ? undefined
          : { backgroundColor: highlighted.bg, color: highlighted.fg }
      }
    >
      <code>
        {lines.map((line, lineIndex) => (
          <span
            className="animate-guided-block-in block"
            key={lineIndex}
            style={
              {
                "--guided-delay": `${120 + Math.min(lineIndex * 45, 900)}ms`,
              } as CSSProperties
            }
          >
            {line.spans.length === 0
              ? "\u00A0"
              : line.spans.map((span, spanIndex) => (
                  <span
                    className="dark:!bg-[var(--shiki-dark-bg)] dark:!text-[var(--shiki-dark)]"
                    key={spanIndex}
                    style={span.style}
                  >
                    {span.content}
                  </span>
                ))}
          </span>
        ))}
      </code>
    </pre>
  );
}

/** Markdown stage: prose blocks drift in one by one, in narration order. */
export function GuidedMarkdownStage(props: { source: string }): ReactElement {
  const blocks = props.source
    .split(/\n{2,}/u)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  return (
    <div className="space-y-4 text-sm leading-relaxed">
      {blocks.map((block, blockIndex) => (
        <div
          className="animate-guided-block-in"
          key={blockIndex}
          style={
            {
              "--guided-delay": `${120 + Math.min(blockIndex * 90, 800)}ms`,
            } as CSSProperties
          }
        >
          <MessageResponse>{block}</MessageResponse>
        </div>
      ))}
    </div>
  );
}
