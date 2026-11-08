import type { GuidedExplanationFocus } from "@curio/api/domain/course";
import { highlightCode } from "@curio/ui/components/ai-elements/code-block";
import type {
  BundledLanguage,
  ThemedToken,
  TokenizedCode,
} from "@curio/ui/components/ai-elements/code-block";
import { MessageResponse } from "@curio/ui/components/ai-elements/message";
import { MousePointer2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Variants } from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactElement, RefObject } from "react";

import { resolveGuidedCodeFocus } from "./guided-explanation-focus";
import type {
  GuidedCodeCursorTarget,
  GuidedCodeFocus,
} from "./guided-explanation-focus";

/** Effect Institute dims the lines that are not being narrated to 40%. */
const DIM_OPACITY = 0.4;
const CURSOR_SIZE = 24;
const CURSOR_BELOW_LINE = 4;
/** MousePointer2's tip sits 4px inside its 24px view box. Offset the box so
 * the tip lands under the focused token instead of the icon's top-left corner. */
const CURSOR_TIP_INSET = 4;

interface GuidedStageSpan {
  readonly content: string;
  /** Exclusive character offsets within the line. */
  readonly end: number;
  readonly start: number;
  readonly style?: CSSProperties;
}

interface GuidedStageLine {
  readonly spans: readonly GuidedStageSpan[];
}

/** A highlighted stage's tokens reshaped for rendering. */
interface GuidedTokens {
  readonly bg: string;
  readonly fg: string;
  readonly lines: GuidedStageLine[];
}

interface GuidedCursorLayout {
  readonly x: number;
  readonly y: number;
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
  // A generic "text"/"code" hint disables syntax color even when the excerpt
  // is unmistakably JavaScript or Python, so treat those as "guess for me".
  const genericHints = new Set([
    "",
    "code",
    "none",
    "plain",
    "plaintext",
    "text",
  ]);
  if (languageHint !== undefined && !genericHints.has(languageHint)) {
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

/** Builds one line's spans with character offsets, so the cursor range can be
 * projected onto individual tokens (and glow only the narrated token). */
function guidedLine(tokens: readonly ThemedToken[]): GuidedStageLine {
  let offset = 0;
  const spans = tokens.map((token) => {
    const start = offset;
    offset += token.content.length;
    return {
      content: token.content,
      end: offset,
      start,
      style: tokenStyle(token),
    };
  });
  return { spans };
}

function tokensToStage(result: TokenizedCode): GuidedTokens {
  return {
    bg: result.bg,
    fg: result.fg,
    lines: result.tokens.map((line) => guidedLine(line)),
  };
}

/** Finds the bounding rect of a character range inside one rendered line. A
 * DOM Range handles token spans, ligatures, and the active font exactly. */
function measureTextRange(
  lineElement: HTMLElement,
  start: number,
  end: number
): DOMRect | null {
  const walker = document.createTreeWalker(lineElement, NodeFilter.SHOW_TEXT);
  let position = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let endNode: Node | null = null;
  let endOffset = 0;
  let node = walker.nextNode();
  while (node !== null) {
    const length = node.textContent?.length ?? 0;
    const nodeEnd = position + length;
    if (startNode === null && start < nodeEnd) {
      startNode = node;
      startOffset = Math.max(0, start - position);
    }
    if (endNode === null && end <= nodeEnd) {
      endNode = node;
      endOffset = Math.max(0, end - position);
      break;
    }
    position = nodeEnd;
    node = walker.nextNode();
  }
  if (startNode === null || endNode === null) {
    return null;
  }
  const range = document.createRange();
  range.setStart(
    startNode,
    Math.min(startOffset, startNode.textContent?.length ?? 0)
  );
  range.setEnd(endNode, Math.min(endOffset, endNode.textContent?.length ?? 0));
  const rect = range.getBoundingClientRect();
  return rect.width === 0 && rect.height === 0 ? null : rect;
}

/** Sums offsetTop up to the pre element. Layout offsets exclude the entrance
 * animation's translateY, so the cursor does not jump while code lines settle. */
function offsetTopWithin(container: HTMLElement, element: HTMLElement): number {
  let top = 0;
  let node: HTMLElement | null = element;
  while (node !== null && node !== container) {
    top += node.offsetTop;
    node = node.offsetParent instanceof HTMLElement ? node.offsetParent : null;
  }
  return top;
}

/** Measures the cursor's target against the real rendered code so the pointer
 * springs to the narrated token rather than a guessed character width. */
function useGuidedCursorLayout(options: {
  readonly containerRef: RefObject<HTMLPreElement | null>;
  readonly cursor: GuidedCodeCursorTarget | null;
  readonly highlighted: GuidedTokens | null;
  readonly source: string;
}): GuidedCursorLayout | null {
  const { containerRef, cursor, highlighted, source } = options;
  const [layout, setLayout] = useState<GuidedCursorLayout | null>(null);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (container === null || cursor === null) {
      // oxlint-disable-next-line react/set-state-in-effect -- clearing a measured overlay after its target disappears is the point
      setLayout(null);
      return;
    }
    const lineElement = container.querySelector<HTMLElement>(
      `[data-guided-line="${cursor.line}"]`
    );
    if (lineElement === null) {
      // oxlint-disable-next-line react/set-state-in-effect -- no rendered line means there is nothing to point at
      setLayout(null);
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const lineRect = lineElement.getBoundingClientRect();
    const start = Math.max(0, cursor.column - 1);
    // Always measure at least one character so a zero-length caret still has
    // a stable centre to spring to.
    const end = Math.max(start + 1, start + cursor.length);
    const textRect = measureTextRange(lineElement, start, end) ?? lineRect;
    const lineTop = offsetTopWithin(container, lineElement);
    const left = textRect.left - containerRect.left;
    const height = Math.max(2, textRect.height);
    // Layout offsets exclude the entrance animation's translateY; adding the
    // in-line text offset keeps the pointer anchored while the stagger is
    // still moving the line.
    const top = lineTop + (textRect.top - lineRect.top);
    setLayout({
      // Place MousePointer2's tip at the token's centre, just below its text.
      x: left + Math.max(2, textRect.width) / 2 - CURSOR_TIP_INSET,
      y: top + height + CURSOR_BELOW_LINE - CURSOR_TIP_INSET,
    });
  }, [containerRef, cursor]);

  // Re-measure after highlighting lands, after the entrance stagger finishes,
  // and whenever the panel or viewport resizes.
  useLayoutEffect(() => {
    measure();
    const frame = requestAnimationFrame(measure);
    const settleTimers = [
      window.setTimeout(measure, 650),
      window.setTimeout(measure, 1300),
    ];
    const container = containerRef.current;
    let observer: ResizeObserver | null = null;
    if (container !== null && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(container);
    }
    window.addEventListener("resize", measure);
    let cancelled = false;
    void (async () => {
      await document.fonts.ready;
      if (!cancelled) {
        measure();
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      for (const timer of settleTimers) {
        window.clearTimeout(timer);
      }
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
    // highlighted/source are re-measure triggers: their token layout changes
    // the character rects even when the cursor stays on the same token.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- listed above intentionally
  }, [containerRef, highlighted, measure, source]);

  return layout;
}

/** Code stage with shiki highlighting, contrast-based line focus, and a
 * floating cursor that springs to the token being explained. */
export function GuidedCodeStage(props: {
  focus?: GuidedExplanationFocus;
  language: string;
  narration: string;
  source: string;
}): ReactElement {
  const [highlighted, setHighlighted] = useState<GuidedTokens | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const codeRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let cancelled = false;
    const applyTokens = (result: TokenizedCode): void => {
      if (cancelled) {
        return;
      }
      setHighlighted(tokensToStage(result));
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

  const resolvedFocus: GuidedCodeFocus | null = useMemo(
    () =>
      resolveGuidedCodeFocus({
        focus: props.focus,
        narration: props.narration,
        source: props.source,
      }),
    [props.focus, props.narration, props.source]
  );
  const cursor = resolvedFocus?.cursor ?? null;
  const cursorLayout = useGuidedCursorLayout({
    containerRef: codeRef,
    cursor,
    highlighted,
    source: props.source,
  });

  const fallbackLines: GuidedStageLine[] = props.source
    .split("\n")
    .map((line) => ({
      spans:
        line.length === 0
          ? []
          : [
              {
                content: line,
                end: line.length,
                start: 0,
              },
            ],
    }));

  const lines = highlighted === null ? fallbackLines : highlighted.lines;
  const focusedLines = new Set(resolvedFocus?.lines);
  const enterTransition = prefersReducedMotion
    ? { duration: 0.01 }
    : { duration: 0.28, ease: "easeOut" as const };
  const cursorTransition = prefersReducedMotion
    ? { duration: 0.01 }
    : { type: "spring" as const, visualDuration: 0.5, bounce: 0.35 };
  return (
    <div className="flex flex-1 items-center justify-center overflow-x-auto">
      <pre
        className="relative w-max rounded-sm p-4 pb-10 font-mono text-lg leading-8 dark:!bg-[var(--shiki-dark-bg)] dark:!text-[var(--shiki-dark)]"
        ref={codeRef}
        style={
          highlighted === null
            ? undefined
            : { backgroundColor: highlighted.bg, color: highlighted.fg }
        }
      >
        <code className="relative z-10 block">
          {lines.map((line, lineIndex) => {
            const lineNumber = lineIndex + 1;
            const isDimmed =
              resolvedFocus !== null &&
              focusedLines.size > 0 &&
              !focusedLines.has(lineNumber);
            return (
              <span
                className="animate-guided-block-in block"
                data-guided-line={lineNumber}
                key={lineIndex}
                style={
                  {
                    "--guided-delay": `${120 + Math.min(lineIndex * 45, 900)}ms`,
                  } as CSSProperties
                }
              >
                <motion.span
                  animate={{ opacity: isDimmed ? DIM_OPACITY : 1 }}
                  className="block"
                  transition={enterTransition}
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
                </motion.span>
              </span>
            );
          })}
        </code>
        <AnimatePresence>
          {cursorLayout === null ? null : (
            <motion.span
              animate={{
                filter: "blur(0px)",
                opacity: 1,
                scale: 1,
                x: cursorLayout.x,
                y: cursorLayout.y,
              }}
              aria-hidden="true"
              className="text-foreground pointer-events-none absolute top-0 left-0 z-20"
              exit={{
                filter: "blur(4px)",
                opacity: 0,
                scale: 0.7,
              }}
              initial={{
                filter: "blur(4px)",
                opacity: 0,
                scale: 0.7,
                x: cursorLayout.x + 40,
                y: cursorLayout.y + 30,
              }}
              key="guided-code-cursor"
              style={{ height: CURSOR_SIZE, width: CURSOR_SIZE }}
              transition={cursorTransition}
            >
              <MousePointer2
                aria-hidden="true"
                className="size-6 drop-shadow-[0_2px_5px_rgba(0,0,0,0.55)]"
                fill="currentColor"
                strokeWidth={1.5}
              />
            </motion.span>
          )}
        </AnimatePresence>
      </pre>
    </div>
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
