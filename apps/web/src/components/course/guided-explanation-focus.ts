import type { GuidedExplanationFocus } from "@curio/db/schema/course";

/**
 * Resolver for `GuidedReasoningFile`-style narration spotlights on guided
 * explanation code stages.
 *
 * Given the lesson's raw `focus` (when the Director wrote one) plus the step
 * narration and the code excerpt, it decides:
 *
 * - which 1-based lines stay bright (everything else dims),
 * - which 1-based character range the floating cursor points at (inferred
 *   from narration identifiers when the Director omitted a cursor).
 *
 * Blank code gets no spotlight, so a step always has a sane fallback.
 */

/** 1-based cursor target after normalization. */
export interface GuidedCodeCursorTarget {
  readonly line: number;
  readonly column: number;
  readonly length: number;
}

/** Resolved code spotlight: focused lines stay bright; cursor is optional. */
export interface GuidedCodeFocus {
  readonly lines: readonly number[];
  readonly cursor: GuidedCodeCursorTarget | null;
}

const CODE_WORD_PATTERN = /[A-Za-z_$][A-Za-z0-9_$]*/gu;

/**
 * Words whose presence in narration is not evidence of a code identifier.
 * Without this English prose would match plain words such as "the" or "is"
 * and drop the cursor onto meaningless tokens.
 */
const CODE_CURSORED_STOPWORDS = new Set([
  "as",
  "at",
  "be",
  "by",
  "each",
  "for",
  "from",
  "goes",
  "has",
  "have",
  "how",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "just",
  "like",
  "never",
  "not",
  "on",
  "only",
  "our",
  "over",
  "reads",
  "returns",
  "runs",
  "shows",
  "so",
  "steps",
  "stays",
  "the",
  "then",
  "this",
  "that",
  "to",
  "use",
  "uses",
  "using",
  "we",
  "when",
  "why",
  "with",
  "you",
  "your",
]);

/** Upper bound on narration candidates scanned while locating a code match. */
const MAX_NARRATION_CANDIDATES = 40;

const MIN_CANDIDATE_LENGTH = 2;

/** Narration words that are too short/generic to serve as identifiers. */
function isUsableNarrationToken(token: string): boolean {
  return (
    token.length >= MIN_CANDIDATE_LENGTH &&
    !CODE_CURSORED_STOPWORDS.has(token.toLowerCase())
  );
}

/** Unique narration words in order of first appearance. */
function narrationCandidates(narration: string): string[] {
  const seen = new Set<string>();
  const tokens = narration.split(/[^A-Za-z0-9_$]+/u);
  for (const rawToken of tokens) {
    if (!isUsableNarrationToken(rawToken)) {
      continue;
    }
    seen.add(rawToken);
    if (seen.size >= MAX_NARRATION_CANDIDATES) {
      break;
    }
  }
  return [...seen];
}

/** 1-based source lines; the last one is never empty unless source is blank. */
function codeLinesOf(source: string): readonly string[] {
  return source.split("\n");
}

interface CodeWordRange {
  readonly column: number;
  readonly length: number;
}

/** First known code word on a 1-based source line, excluding comment markers. */
function firstIdentifierOnLine(line: string): CodeWordRange | null {
  let scanner = line.replace(/^[\s]*\/\/+[^\n]*$/u, "").replace(
    /^[ \t]*\/\*+[\s\S]*?\*+\/\s*/u,
    ""
  );
  scanner = scanner.replace(/^[ \t]*-[ \t]*/u, "").replace(
    /^[ \t]*#+[ \t]*/u,
    ""
  );
  const match = scanner.match(CODE_WORD_PATTERN);
  if (match === null || match.index === undefined) {
    return null;
  }
  return { column: match.index + 1, length: match[0].length };
}

/** Word starting exactly at `column` (1-based) on the line, set to null if none. */
function wordAtColumn(line: string, column: number): CodeWordRange | null {
  const lineIndex = Math.max(0, column - 1);
  const remaining = line.slice(lineIndex);
  const match = remaining.match(CODE_WORD_PATTERN);
  if (match === null || match.index !== 0) {
    return null;
  }
  return { column, length: match[0].length };
}

/** Find first narration identifier that appears as a code word in `sourceLines`. */
function cursorFromNarration(
  narration: string,
  sourceLines: readonly string[]
): GuidedCodeCursorTarget | null {
  for (const candidate of narrationCandidates(narration)) {
    for (const [lineIndex, line] of sourceLines.entries()) {
      const words = line.match(CODE_WORD_PATTERN);
      if (words === null) {
        continue;
      }
      const column = words.indexOf(candidate) + 1;
      if (column === 0) {
        continue;
      }
      // The candidate must start at a 1-based column; the size of that token
      // - not the whole word list - becomes the cursor length.
      const onLine = wordAtColumn(line, column);
      if (onLine !== null) {
        return {
          column: onLine.column,
          length: onLine.length,
          line: lineIndex + 1,
        };
      }
    }
  }
  return null;
}

interface CursorInputs {
  readonly focusCursor?: GuidedExplanationFocus["cursor"];
  readonly fallbackLine: number;
  readonly sourceLines: readonly string[];
}

function normalizeCursor(inputs: CursorInputs): GuidedCodeCursorTarget | null {
  const { focusCursor, fallbackLine, sourceLines } = inputs;
  const line = Math.min(
    Math.max(focusCursor?.line ?? fallbackLine, 1),
    sourceLines.length
  );
  const lineText = sourceLines[line - 1] ?? "";
  if (lineText.trim() === "") {
    return null;
  }
  if (focusCursor?.column !== undefined) {
    const column = Math.min(
      Math.max(Math.round(focusCursor.column), 1),
      Math.max(lineText.length, 1)
    );
    const range =
      focusCursor.length !== undefined
        ? { column, length: Math.max(Math.round(focusCursor.length), 1) }
        : (wordAtColumn(lineText, column) ?? {
            column,
            length: 1,
          });
    return {
      column: range.column,
      length: range.length,
      line,
    };
  }
  const firstWord = firstIdentifierOnLine(lineText);
  if (firstWord === null) {
    return null;
  }
  return {
    column: firstWord.column,
    length:
      focusCursor?.length !== undefined
        ? Math.max(Math.round(focusCursor.length), 1)
        : firstWord.length,
    line,
  };
}

/**
 * Purposes one guided explanation code stage's spotlight from the authored
 * focus (when present) plus the narration text.
 *
 * Rules, from the spec doc:
 * - blank code gets no spotlight,
 * - authored `focus.lines` wins, invalid line numbers are ignored,
 * - authored `focus.cursor` overrides defaults; `line` defaults to the first
 *   focused line, `column` to the first meaningful identifier on that line,
 *   and length to that identifier's length,
 * - lessons without `focus` infer the focused line by matching narration
 *   identifiers against the code, then point at the named token.
 */
export function resolveGuidedCodeFocus(options: {
  readonly focus?: GuidedExplanationFocus;
  readonly narration: string;
  readonly source: string;
}): GuidedCodeFocus | null {
  if (options.source.trim() === "") {
    return null;
  }
  const sourceLines = codeLinesOf(options.source);
  const focus = options.focus;
  if (focus !== undefined) {
    const sourceLineCount = sourceLines.length;
    const lines = Array.from(new Set(focus.lines)).filter(
      (line) => line >= 1 && line <= sourceLineCount
    );
    if (lines.length > 0) {
      const cursor =
        normalizeCursor({
          fallbackLine: lines[0],
          focusCursor: focus.cursor,
          sourceLines,
        }) ??
        cursorFromNarration(options.narration, sourceLines);
      return {
        cursor: cursor === null ? null : cursor,
        lines: lines.sort((left, right) => left - right),
      };
    }
  }
  const cursorFromNarrationMatch = cursorFromNarration(
    options.narration,
    sourceLines
  );
  if (cursorFromNarrationMatch !== null) {
    return {
      cursor: cursorFromNarrationMatch,
      lines: [cursorFromNarrationMatch.line],
    };
  }
  return null;
}
