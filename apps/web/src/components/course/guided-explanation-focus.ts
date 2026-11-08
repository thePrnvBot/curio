import type { GuidedExplanationFocus } from "@curio/api/domain/course";

/**
 * Resolver for `GuidedReasoningFile`-style narration spotlights on guided
 * explanation code stages.
 *
 * Given the lesson's raw `focus` (when the Director wrote one) plus the step
 * narration and the code excerpt, it decides:
 *
 * - which 1-based lines stay bright (everything else dims),
 * - which 1-based character range the floating cursor points at.
 *
 * Accuracy rules, in priority order:
 *
 * 1. `focus.cursor.token` names the exact code text under the cursor (e.g.
 *    "unknown" or "error.message"). The token is located in the excerpt, so a
 *    miscounted column can never drag the pointer onto the wrong character.
 * 2. Authored `line` + `column` are snapped to the nearest real code token on
 *    that line: writers count characters imperfectly, and landing beside a
 *    token should still point at it.
 * 3. Narration identifiers locate the token, preferring the focused lines and
 *    backticked code references, with full character positions taken from the
 *    source instead of guessed from word order.
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
const BACKTICK_PATTERN = /`(?<token>[^`\n]+)`/gu;
const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;
const WORD_CHARACTER_PATTERN = /[A-Za-z0-9_$]/u;

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
const MAX_NARRATION_CANDIDATES = 80;

const MIN_CANDIDATE_LENGTH = 2;

/** How far an authored column may be from a token and still snap to it. */
const MAX_COLUMN_SNAP_DISTANCE = 24;

interface CodeWordRange {
  readonly column: number;
  readonly length: number;
  readonly word: string;
}

interface MaskedLine {
  /** Comments masked; strings preserved (literal values remain targetable). */
  readonly text: string;
  /** Comments and string contents masked; only executable tokens remain. */
  readonly code: string;
  readonly openBlockComment: boolean;
}

interface SourceWord {
  readonly column: number;
  readonly length: number;
  readonly line: number;
  readonly word: string;
}

interface NarrationCandidate {
  readonly backticked: boolean;
  readonly order: number;
  readonly text: string;
}

/** Narration words that are too short/generic to serve as identifiers. */
function isUsableNarrationToken(token: string, backticked: boolean): boolean {
  return (
    token.length >= (backticked ? 1 : MIN_CANDIDATE_LENGTH) &&
    (backticked || !CODE_CURSORED_STOPWORDS.has(token.toLowerCase()))
  );
}

function maskLine(line: string, startsInBlockComment: boolean): MaskedLine {
  let text = "";
  let code = "";
  let index = 0;
  let openBlockComment = startsInBlockComment;
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;

  const maskRest = (): void => {
    const padding = " ".repeat(line.length - index);
    text += padding;
    code += padding;
    index = line.length;
  };

  while (index < line.length) {
    const character = line[index] ?? "";
    if (openBlockComment) {
      const commentEnd = line.indexOf("*/", index);
      if (commentEnd === -1) {
        maskRest();
      } else {
        const padding = " ".repeat(commentEnd + 2 - index);
        text += padding;
        code += padding;
        index = commentEnd + 2;
        openBlockComment = false;
      }
      continue;
    }
    if (quote !== null) {
      // String values stay visible for literal matching but are removed from
      // the code-only view so a keyword inside text can't steal the cursor.
      text += character;
      code += " ";
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      index += 1;
      continue;
    }
    if (character === "/" && line[index + 1] === "/") {
      maskRest();
      continue;
    }
    if (character === "/" && line[index + 1] === "*") {
      openBlockComment = true;
      index += 2;
      text += "  ";
      code += "  ";
      continue;
    }
    const next = line[index + 1];
    if (
      character === "#" &&
      (next === undefined || /\s/u.test(next) || next === "!")
    ) {
      maskRest();
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      text += character;
      code += " ";
      index += 1;
      continue;
    }
    text += character;
    code += character;
    index += 1;
  }

  return { code, openBlockComment, text };
}

interface MaskedSource {
  readonly codeLines: readonly string[];
  readonly textLines: readonly string[];
}

/**
 * Masks comments while preserving the line's character positions, so code
 * words can be located exactly (and prose in comments never steals the
 * cursor). A second view also masks string contents for executable-token
 * matching.
 */
function maskSourceLines(lines: readonly string[]): MaskedSource {
  let openBlockComment = false;
  const codeLines: string[] = [];
  const textLines: string[] = [];
  for (const line of lines) {
    const {
      code,
      openBlockComment: nextOpenBlockComment,
      text,
    } = maskLine(line, openBlockComment);
    openBlockComment = nextOpenBlockComment;
    codeLines.push(code);
    textLines.push(text);
  }
  return { codeLines, textLines };
}

/** 1-based source lines; the last one is never empty unless source is blank. */
function codeLinesOf(source: string): readonly string[] {
  return source.split("\n");
}

/** All code words on a masked line, with exact 1-based character columns. */
function codeWordsOnLine(line: string): CodeWordRange[] {
  const words: CodeWordRange[] = [];
  for (const match of line.matchAll(CODE_WORD_PATTERN)) {
    if (match.index === undefined) {
      continue;
    }
    words.push({
      column: match.index + 1,
      length: match[0].length,
      word: match[0],
    });
  }
  return words;
}

/** First code word on a masked line. */
function firstIdentifierOnLine(line: string): CodeWordRange | null {
  return codeWordsOnLine(line)[0] ?? null;
}

/**
 * Snaps an authored 1-based column to a real code word. Columns inside a word
 * (or just beside one) resolve to that word instead of a punctuation mark.
 */
function wordAtColumn(line: string, column: number): CodeWordRange | null {
  const words = codeWordsOnLine(line);
  if (words.length === 0) {
    return null;
  }
  const index = Math.max(0, column - 1);
  for (const word of words) {
    const start = word.column - 1;
    const end = start + word.length;
    if (index >= start && index < end) {
      return word;
    }
  }
  let nearest: CodeWordRange | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const word of words) {
    const start = word.column - 1;
    const end = start + word.length;
    const distance = index < start ? start - index : index - end;
    if (distance < nearestDistance) {
      nearest = word;
      nearestDistance = distance;
    }
  }
  return nearestDistance <= MAX_COLUMN_SNAP_DISTANCE ? nearest : null;
}

/** Finds `token` on a line, matching case-insensitively with word boundaries
 * for plain identifiers. Returns the exact source range. */
function findRangeOnLine(line: string, token: string): CodeWordRange | null {
  const lowerLine = line.toLowerCase();
  const lowerToken = token.toLowerCase();
  const identifier = IDENTIFIER_PATTERN.test(token);
  let from = 0;
  for (;;) {
    const index = lowerLine.indexOf(lowerToken, from);
    if (index === -1) {
      return null;
    }
    const before = index === 0 ? "" : (line[index - 1] ?? "");
    const after = line[index + token.length] ?? "";
    if (
      !identifier ||
      (!WORD_CHARACTER_PATTERN.test(before) &&
        !WORD_CHARACTER_PATTERN.test(after))
    ) {
      return {
        column: index + 1,
        length: token.length,
        word: line.slice(index, index + token.length),
      };
    }
    from = index + 1;
  }
}

/** Line visit order: authored hint first, then focused lines, then the rest. */
function priorityLineNumbers(options: {
  readonly focusLines: readonly number[];
  readonly lineCount: number;
  readonly preferredLine: number | null;
}): number[] {
  const ordered: number[] = [];
  const seen = new Set<number>();
  const add = (line: number): void => {
    if (line >= 1 && line <= options.lineCount && !seen.has(line)) {
      seen.add(line);
      ordered.push(line);
    }
  };
  if (options.preferredLine !== null) {
    add(options.preferredLine);
  }
  for (const line of options.focusLines) {
    add(line);
  }
  for (let line = 1; line <= options.lineCount; line += 1) {
    add(line);
  }
  return ordered;
}

/** Locates an exact token/expression in the excerpt, preferring focus lines. */
function findTokenCursor(options: {
  readonly codeLines: readonly string[];
  readonly orderedLines: readonly number[];
  readonly textLines: readonly string[];
  readonly token: string;
}): GuidedCodeCursorTarget | null {
  const trimmed = options.token.trim();
  if (trimmed === "") {
    return null;
  }
  const withoutTicks = trimmed.replaceAll(/^`+|`+$/gu, "").trim();
  const variants =
    withoutTicks === trimmed ? [trimmed] : [trimmed, withoutTicks];
  // A quoted token targets a string literal; otherwise executable code wins
  // over a same-named word inside a string.
  const looksQuoted = /^["'`]|["'`]$/u.test(trimmed);
  const lineSets = looksQuoted
    ? [options.textLines, options.codeLines]
    : [options.codeLines, options.textLines];
  for (const lines of lineSets) {
    for (const variant of variants) {
      for (const lineNumber of options.orderedLines) {
        const line = lines[lineNumber - 1] ?? "";
        const range = findRangeOnLine(line, variant);
        if (range !== null) {
          return {
            column: range.column,
            length: range.length,
            line: lineNumber,
          };
        }
      }
    }
  }
  return null;
}

/** Index every code word in the excerpt, grouped by lowercase spelling. */
function sourceWordIndex(
  maskedLines: readonly string[]
): Map<string, readonly SourceWord[]> {
  const words = new Map<string, SourceWord[]>();
  for (const [lineIndex, line] of maskedLines.entries()) {
    for (const word of codeWordsOnLine(line)) {
      const key = word.word.toLowerCase();
      const occurrences = words.get(key);
      const occurrence: SourceWord = {
        column: word.column,
        length: word.length,
        line: lineIndex + 1,
        word: word.word,
      };
      if (occurrences === undefined) {
        words.set(key, [occurrence]);
      } else {
        occurrences.push(occurrence);
      }
    }
  }
  return words;
}

/** Code word intersected by a cursor target, if the target is a word. */
function codeWordAtTarget(
  codeLines: readonly string[],
  target: GuidedCodeCursorTarget
): string | null {
  const line = codeLines[target.line - 1] ?? "";
  const start = target.column - 1;
  const end = start + target.length;
  for (const word of codeWordsOnLine(line)) {
    const wordStart = word.column - 1;
    const wordEnd = wordStart + word.length;
    if (wordStart < end && wordEnd > start) {
      return word.word;
    }
  }
  return null;
}

/** Matching source word with the best (lowest) line priority. */
function findWordMatch(
  text: string,
  words: ReadonlyMap<string, readonly SourceWord[]>,
  linePriority: ReadonlyMap<number, number>
): SourceWord | null {
  const occurrences = words.get(text.toLowerCase());
  if (occurrences === undefined) {
    return null;
  }
  let best: SourceWord | null = null;
  let bestPriority = Number.POSITIVE_INFINITY;
  for (const word of occurrences) {
    const priority = linePriority.get(word.line) ?? Number.POSITIVE_INFINITY;
    if (priority < bestPriority) {
      best = word;
      bestPriority = priority;
    }
  }
  return best;
}

/** Unique narration references: backticked expressions first, then prose. */
function narrationCandidates(narration: string): NarrationCandidate[] {
  const candidates: NarrationCandidate[] = [];
  const seen = new Set<string>();
  let order = 0;
  const push = (rawToken: string, backticked: boolean): void => {
    const text = rawToken.trim();
    if (!isUsableNarrationToken(text, backticked)) {
      return;
    }
    const key = `${backticked ? "code" : "prose"}:${text.toLowerCase()}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push({ backticked, order, text });
    order += 1;
  };

  for (const match of narration.matchAll(BACKTICK_PATTERN)) {
    const content = match.groups?.token?.trim() ?? "";
    if (content === "") {
      continue;
    }
    // The whole expression is the strongest signal; its identifiers are the
    // fallback when the expression spans formatting or extra whitespace.
    push(content, true);
    for (const token of content.split(/[^A-Za-z0-9_$]+/u)) {
      push(token, true);
    }
  }

  const prose = narration.replace(BACKTICK_PATTERN, " ");
  for (const token of prose.split(/[^A-Za-z0-9_$]+/u)) {
    push(token, false);
  }

  return candidates.slice(0, MAX_NARRATION_CANDIDATES);
}

/** True when the narration names this code word (backticked or plain). */
function narrationMentionsWord(narration: string, word: string): boolean {
  const lowerWord = word.toLowerCase();
  return narrationCandidates(narration).some(
    (candidate) => candidate.text.toLowerCase() === lowerWord
  );
}

/** True when a narration reference looks like code rather than plain prose. */
function looksLikeCode(text: string): boolean {
  return (
    /[A-Z_$]|\d/u.test(text) || /[a-z][A-Z]/u.test(text) || text.length >= 7
  );
}

/**
 * Infers the narrated token from the narration text. Backticked references
 * and matches on authored focus lines win; skipped words in comments never
 * become cursor targets.
 */
function cursorFromNarration(options: {
  readonly codeLines: readonly string[];
  readonly focusedLines: readonly number[];
  readonly narration: string;
  readonly sourceLines: readonly string[];
  readonly textLines: readonly string[];
}): GuidedCodeCursorTarget | null {
  const candidates = narrationCandidates(options.narration);
  if (candidates.length === 0) {
    return null;
  }
  const codeWords = sourceWordIndex(options.codeLines);
  const textWords = sourceWordIndex(options.textLines);
  const orderedLines = priorityLineNumbers({
    focusLines: options.focusedLines,
    lineCount: options.sourceLines.length,
    preferredLine: null,
  });
  const linePriority = new Map(
    orderedLines.map((line, index) => [line, index] as const)
  );
  const focusedLineSet = new Set(options.focusedLines);

  let best: { cursor: GuidedCodeCursorTarget; score: number } | null = null;
  for (const candidate of candidates) {
    let cursor: GuidedCodeCursorTarget | null = null;
    // Expressions (dotted names, calls, operators) are searched verbatim
    // before being split into identifier words.
    if (/[^A-Za-z0-9_$]/u.test(candidate.text)) {
      cursor = findTokenCursor({
        codeLines: options.codeLines,
        orderedLines,
        textLines: options.textLines,
        token: candidate.text,
      });
    }
    if (cursor === null) {
      const word =
        findWordMatch(candidate.text, codeWords, linePriority) ??
        findWordMatch(candidate.text, textWords, linePriority);
      if (word !== null) {
        cursor = {
          column: word.column,
          length: word.length,
          line: word.line,
        };
      }
    }
    if (cursor === null) {
      continue;
    }
    const score =
      (candidate.backticked ? 100 : 0) +
      (focusedLineSet.has(cursor.line) ? 25 : 0) +
      (looksLikeCode(candidate.text) ? 8 : 0) +
      Math.min(candidate.text.length, 20) -
      candidate.order * 0.2;
    if (best === null || score > best.score) {
      best = { cursor, score };
    }
  }
  return best?.cursor ?? null;
}

/**
 * Keeps an authored length only when the column started exactly at the token;
 * otherwise the snapped token's own length is the trustworthy range.
 */
function snappedLength(
  snapped: CodeWordRange,
  authoredColumn: number | null,
  authoredLength: number | null
): number {
  if (authoredLength === null) {
    return snapped.length;
  }
  if (authoredColumn !== snapped.column) {
    return snapped.length;
  }
  return Math.max(authoredLength, snapped.length);
}

interface AuthoredCursorInputs {
  readonly codeLines: readonly string[];
  readonly fallbackLine: number;
  readonly focusedLines: readonly number[];
  readonly focusCursor: GuidedExplanationFocus["cursor"];
  readonly sourceLines: readonly string[];
  readonly textLines: readonly string[];
}

/** Resolves the authored cursor, preferring the exact token over columns. */
// Token, line, column, length and focus-line fallbacks form one priority
// ladder; splitting it would duplicate the same normalization paths.
// oxlint-disable-next-line complexity
function authoredCursor(
  inputs: AuthoredCursorInputs
): GuidedCodeCursorTarget | null {
  const { codeLines, focusCursor, fallbackLine, focusedLines, textLines } =
    inputs;
  const sourceLineCount = inputs.sourceLines.length;
  const preferredLine = Math.min(
    Math.max(Math.round(focusCursor?.line ?? fallbackLine), 1),
    sourceLineCount
  );
  const orderedLines = priorityLineNumbers({
    focusLines: focusedLines,
    lineCount: sourceLineCount,
    preferredLine,
  });

  if (focusCursor?.token !== undefined) {
    const tokenCursor = findTokenCursor({
      codeLines,
      orderedLines,
      textLines,
      token: focusCursor.token,
    });
    if (tokenCursor !== null) {
      return tokenCursor;
    }
    if (focusCursor.column === undefined) {
      // The authored token was not found; narration may still name the real
      // token, so don't pin the first word just to have something to show.
      return null;
    }
  }

  const lineText = codeLines[preferredLine - 1] ?? "";
  if (lineText.trim() !== "") {
    const snapped =
      focusCursor?.column === undefined
        ? firstIdentifierOnLine(lineText)
        : wordAtColumn(lineText, Math.round(focusCursor.column));
    if (snapped !== null) {
      const availableLength = Math.max(
        lineText.length - (snapped.column - 1),
        1
      );
      const authoredColumn =
        focusCursor?.column === undefined
          ? null
          : Math.round(focusCursor.column);
      const authoredLength =
        focusCursor?.length === undefined
          ? null
          : Math.min(
              Math.max(Math.round(focusCursor.length), 1),
              availableLength
            );
      // A column inside/beside a token means the authored length belongs to
      // a different character run; the whole snapped token is the real target.
      const length = snappedLength(snapped, authoredColumn, authoredLength);
      return { column: snapped.column, length, line: preferredLine };
    }
  }

  if (focusCursor?.column !== undefined) {
    // An explicit column that cannot be snapped is not trustworthy; let the
    // narration-based resolver try instead of pinning an arbitrary word.
    return null;
  }

  // The hinted line is blank or comment-only: fall back to the first focused
  // line that actually contains code rather than pointing into empty space.
  for (const line of focusedLines) {
    if (line === preferredLine) {
      continue;
    }
    const firstWord = firstIdentifierOnLine(codeLines[line - 1] ?? "");
    if (firstWord !== null) {
      return { column: firstWord.column, length: firstWord.length, line };
    }
  }
  return null;
}

/** Picks between the authored cursor and the narration-inferred cursor. */
function chooseCursor(options: {
  readonly authored: GuidedCodeCursorTarget | null;
  readonly authoredLines: readonly number[];
  readonly codeLines: readonly string[];
  readonly focusCursor: GuidedExplanationFocus["cursor"];
  readonly narration: string;
  readonly narrationCursor: GuidedCodeCursorTarget | null;
}): GuidedCodeCursorTarget | null {
  const {
    authored,
    authoredLines,
    codeLines,
    focusCursor,
    narration,
    narrationCursor,
  } = options;
  const authoredHasPosition =
    focusCursor?.token !== undefined || focusCursor?.column !== undefined;
  // No explicit position: the narration names the token more precisely than
  // "first word on the line".
  if (!authoredHasPosition) {
    return narrationCursor ?? authored;
  }
  if (authored === null) {
    return narrationCursor;
  }
  // An exact authored token is authoritative; without one, keep the authored
  // cursor unless the narration clearly names a different token on a focused
  // line (the common symptom of a miscounted fallback column).
  if (focusCursor?.token !== undefined || narrationCursor === null) {
    return authored;
  }
  const authoredWord = codeWordAtTarget(codeLines, authored);
  if (authoredWord === null) {
    return authored;
  }
  const narrationIsFocused =
    authoredLines.length === 0 || authoredLines.includes(narrationCursor.line);
  if (!narrationIsFocused || narrationMentionsWord(narration, authoredWord)) {
    return authored;
  }
  return narrationCursor;
}

/**
 * Purposes one guided explanation code stage's spotlight from the authored
 * focus (when present) plus the narration text.
 *
 * Rules, from the spec doc:
 * - blank code gets no spotlight,
 * - authored `focus.lines` wins, invalid line numbers are ignored,
 * - authored `focus.cursor.token` is located in the excerpt and overrides
 *   column counting; `line`/`column`/`length` are normalized and snapped to
 *   real tokens,
 * - lessons without a usable cursor infer the narrated line by matching
 *   backticked references and narration identifiers against the code,
 *   preferring authored focus lines,
 * - the resolved cursor's line is always kept bright so the pointer never
 *   points at a dimmed line.
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
  const { codeLines, textLines } = maskSourceLines(sourceLines);
  const { focus } = options;
  const sourceLineCount = sourceLines.length;
  const authoredLines =
    focus === undefined
      ? []
      : [...new Set(focus.lines)]
          .filter((line) => line >= 1 && line <= sourceLineCount)
          .toSorted((left, right) => left - right);
  const narrationCursor = cursorFromNarration({
    codeLines,
    focusedLines: authoredLines,
    narration: options.narration,
    sourceLines,
    textLines,
  });

  if (
    focus !== undefined &&
    (focus.cursor !== undefined || authoredLines.length > 0)
  ) {
    const authored = authoredCursor({
      codeLines,
      fallbackLine: authoredLines[0] ?? focus.cursor?.line ?? 1,
      focusedLines: authoredLines,
      focusCursor: focus.cursor,
      sourceLines,
      textLines,
    });
    const cursor = chooseCursor({
      authored,
      authoredLines,
      codeLines,
      focusCursor: focus.cursor,
      narration: options.narration,
      narrationCursor,
    });

    if (authoredLines.length > 0) {
      const lines = new Set(authoredLines);
      if (cursor !== null) {
        lines.add(cursor.line);
      }
      return {
        cursor,
        lines: [...lines].toSorted((left, right) => left - right),
      };
    }
    if (cursor !== null) {
      return { cursor, lines: [cursor.line] };
    }
  }

  if (narrationCursor !== null) {
    return { cursor: narrationCursor, lines: [narrationCursor.line] };
  }
  return null;
}
