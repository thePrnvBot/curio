/**
 * Speech text normalization for the Kokoro narration voice.
 *
 * Lesson narration is authored as readable prose, but writers naturally reach
 * for markdown, backticks and code punctuation (`**`, `_`, `console.log`,
 * `x === 5`, arrows, braces...). The eSpeak phonemizer behind Kokoro keeps
 * some of those characters, so it can literally say "asterisk",
 * "underscore", "backtick" or "equals equals equals" instead of speaking the
 * sentence. This pass rewrites the narration into plain spoken words before it
 * reaches synthesis; the on-screen transcript keeps the original text.
 */

const FENCED_CODE_PATTERN = /```[\w-]*[ \t]*\n?(?<code>[\s\S]*?)```/gu;
const INLINE_CODE_PATTERN = /`(?<code>[^`\n]+)`/gu;
const IMAGE_PATTERN = /!\[(?<alt>[^\]]*)\]\([^)]*\)/gu;
const LINK_PATTERN = /\[(?<label>[^\]]+)\]\([^)]*\)/gu;
const AUTOLINK_PATTERN = /<(?:https?|mailto):[^>\s]+>/gu;
const URL_PATTERN = /\bhttps?:\/\/\S+/giu;
const HTML_TAG_PATTERN = /<\/?[A-Za-z][^>\n]*>/gu;
const TABLE_SEPARATOR_PATTERN =
  /^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$/gmu;
const HORIZONTAL_RULE_PATTERN =
  /^[ \t]{0,3}(?<mark>[-*_])(?:[ \t]*\k<mark>){2,}[ \t]*$/gmu;
const HEADING_PATTERN = /^[ \t]{0,3}#{1,6}[ \t]+/gmu;
const BLOCKQUOTE_PATTERN = /^[ \t]{0,3}>[ \t]?/gmu;
const LIST_MARKER_PATTERN = /^[ \t]{0,6}(?:[-*+]|\d{1,2}[.)])[ \t]+/gmu;

/** Multi-character operators first so `!==` never becomes `!` + `==`. */
const SYMBOL_WORDS: readonly (readonly [RegExp, string])[] = [
  [/!==|≠/gu, " does not equal "],
  [/[=]{3}/gu, " strictly equals "],
  [/[=]{2}/gu, " equals "],
  [/!=/gu, " does not equal "],
  [/<=|≤/gu, " less than or equal to "],
  [/>=|≥/gu, " greater than or equal to "],
  [/[=]>/gu, " arrow "],
  [/->/gu, " arrow "],
  [/<-/gu, " from "],
  [/↔/gu, " to and from "],
  [/→/gu, " to "],
  [/←/gu, " from "],
  [/\+\+/gu, " plus plus "],
  [/--/gu, " minus minus "],
  [/\+=/gu, " plus equals "],
  [/-=/gu, " minus equals "],
  [/\*=/gu, " times equals "],
  [/\/=/gu, " divided by equals "],
  [/\?\?/gu, " or "],
  [/\?\./gu, " "],
  [/&&/gu, " and "],
  [/\|\|/gu, " or "],
];

/**
 * Expands code symbols into spoken words while leaving everyday punctuation
 * (commas, periods, question marks, quotes) for the phonemizer to phrase.
 */
function normalizeSymbols(input: string): string {
  let text = input;
  // `console.log`, `error.message`, `Node.js` -> words, never "dot". Decimal
  // points stay untouched because the right side must start with a letter.
  text = text.replaceAll(/(?<=[A-Za-z0-9_$])\.(?=[A-Za-z_$])/gu, " ");
  // Numeric separators disappear ("1_000" -> "1000"); other underscores
  // become word breaks ("user_name" -> "user name").
  text = text.replaceAll(/(?<=\d)_+(?=\d)/gu, "");
  text = text.replaceAll(/_+/gu, " ");
  text = text.replaceAll(
    /\$(?<amount>\d[\d,]*(?:\.\d+)?)/gu,
    "$<amount> dollars"
  );
  text = text.replaceAll(/\$(?=[A-Za-z_])/gu, "");
  // Long dash runs are markdown dividers, not subtraction.
  text = text.replaceAll(/-{3,}/gu, " ");
  for (const [pattern, replacement] of SYMBOL_WORDS) {
    text = text.replaceAll(pattern, replacement);
  }
  text = text.replaceAll(/\bC#/gu, "C sharp");
  text = text.replaceAll(/\bF#/gu, "F sharp");
  text = text.replaceAll(
    /(?<left>\w) < (?<right>\w)/gu,
    "$<left> less than $<right>"
  );
  text = text.replaceAll(
    /(?<left>\w) > (?<right>\w)/gu,
    "$<left> greater than $<right>"
  );
  text = text.replaceAll(/#(?=\d)/gu, " number ");
  text = text.replaceAll("#", " ");
  text = text.replaceAll("%", " percent ");
  text = text.replaceAll("&", " and ");
  text = text.replaceAll("|", " or ");
  text = text.replaceAll("@", " at ");
  text = text.replaceAll("$", " ");
  text = text.replaceAll(/[\\/{}[\]()<>~^`]/gu, " ");
  // Keep clock times ("10:30") for the phonemizer; other colons are pauses.
  text = text.replaceAll(/(?<!\d):(?!\d)/gu, ", ");
  text = text.replaceAll(";", ". ");
  text = text.replaceAll(/(?<prefix>^|\s)-(?=\d)/gu, "$<prefix> minus ");
  // A lone hyphen has no spoken meaning; compound words read better with a
  // space ("read-only" -> "read only").
  text = text.replaceAll(/(?<![\w])-(?![\w])/gu, " ");
  text = text.replaceAll(/(?<=[A-Za-z0-9])-(?=[A-Za-z0-9])/gu, " ");
  text = text.replaceAll("+", " plus ");
  text = text.replaceAll(/[=]/gu, " equals ");
  text = text.replaceAll("*", " times ");
  text = text.replaceAll(/[‘’]/gu, "'");
  text = text.replaceAll(/[“”]/gu, '"');
  text = text.replaceAll(/[«»]/gu, " ");
  text = text.replaceAll(/[•·]/gu, ", ");
  text = text.replaceAll(/[—–]/gu, ", ");
  text = text.replaceAll("…", ".");
  text = text.replaceAll("×", " times ");
  text = text.replaceAll("÷", " divided by ");
  text = text.replaceAll(/[\p{Extended_Pictographic}\uFE0F]/gu, " ");
  return text;
}

/** Code spans lose brackets and punctuation that would otherwise be read. */
function speakableCode(code: string): string {
  return normalizeSymbols(
    code
      .replaceAll(/\r\n?/gu, "\n")
      .replaceAll(/\n+/gu, ", ")
      .replaceAll(/(?<name>[A-Za-z_$][\w$]*)\(\)/gu, "$<name>")
      .replaceAll(/[()[\]{}]/gu, " ")
  ).trim();
}

/** Removes markdown emphasis without collapsing snake_case words. */
function stripMarkdownEmphasis(text: string): string {
  let result = text;
  result = result.replaceAll(/\*\*|__|~~/gu, "");
  result = result.replaceAll(
    /(?<prefix>^|[\s(["'])\*(?<content>[^*\n]+)\*(?=$|[\s)\]"',.;:!?])/gmu,
    "$<prefix>$<content>"
  );
  result = result.replaceAll(
    /(?<prefix>^|[\s(["'])_(?<content>[^_\n]+)_(?=$|[\s)\]"',.;:!?])/gmu,
    "$<prefix>$<content>"
  );
  result = result.replaceAll(/[*~]/gu, "");
  result = result.replaceAll(/(?<=\d)_+(?=\d)/gu, "");
  result = result.replaceAll("_", " ");
  return result;
}

/** Collapses artifacts from symbol expansion into readable punctuation. */
function cleanSpokenText(text: string): string {
  const cleaned = text
    .replaceAll(/\s+/gu, " ")
    .replaceAll(/\s+(?<mark>[,.;:!?])/gu, "$<mark>")
    .replaceAll(/(?<mark>[,;:])\s*\k<mark>+/gu, "$<mark>")
    .replaceAll(/\.{2,}/gu, ".")
    .replaceAll(/\s+(?<mark>[,.;:!?])/gu, "$<mark>")
    .replaceAll(/^[,;:.!?\s]+/gu, "")
    .trim();
  return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : "";
}

/**
 * Converts one narration sentence (or a short multi-line block) into text the
 * Kokoro phonemizer reads like a person. Returns an empty string when nothing
 * pronounceable remains, so callers can skip synthesis entirely.
 */
export function toSpokenNarration(text: string): string {
  let spoken = text
    .replaceAll(/\r\n?/gu, "\n")
    .replaceAll(/[\u200B-\u200D\uFEFF]/gu, "");

  // Common Latin abbreviations confuse the sentence/phoneme splitter.
  spoken = spoken.replaceAll(/\be\.g\./giu, "for example");
  spoken = spoken.replaceAll(/\bi\.e\./giu, "that is");

  spoken = spoken.replaceAll(
    FENCED_CODE_PATTERN,
    (_match: string, code: string): string => ` ${speakableCode(code)} `
  );
  spoken = spoken.replaceAll(IMAGE_PATTERN, "$<alt>");
  spoken = spoken.replaceAll(LINK_PATTERN, "$<label>");
  spoken = spoken.replaceAll(AUTOLINK_PATTERN, " ");
  spoken = spoken.replaceAll(URL_PATTERN, " ");
  spoken = spoken.replaceAll(HTML_TAG_PATTERN, " ");
  spoken = spoken.replaceAll(TABLE_SEPARATOR_PATTERN, " ");
  spoken = spoken.replaceAll(HORIZONTAL_RULE_PATTERN, ". ");
  spoken = spoken.replaceAll(HEADING_PATTERN, "");
  spoken = spoken.replaceAll(BLOCKQUOTE_PATTERN, "");
  spoken = spoken.replaceAll(LIST_MARKER_PATTERN, "");
  spoken = spoken.replaceAll(
    INLINE_CODE_PATTERN,
    (_match: string, code: string): string => ` ${speakableCode(code)} `
  );

  return cleanSpokenText(normalizeSymbols(stripMarkdownEmphasis(spoken)));
}
