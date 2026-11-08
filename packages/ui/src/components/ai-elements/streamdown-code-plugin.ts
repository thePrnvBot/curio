import type { BundledLanguage as ShikiBundledLanguage } from "shiki";
import type { BundledLanguage, CodeHighlighterPlugin } from "streamdown";

import {
  HIGHLIGHT_LANGUAGES,
  highlightCode,
  isHighlightableLanguage,
} from "./code-block";

/**
 * Streamdown's syntax-highlighting plugin backed by the same fine-grained
 * Shiki highlighter as `CodeBlock`. Using `@streamdown/code` would pull in the
 * full Shiki language bundle (every grammar, client and server); this adapter
 * keeps Streamdown markdown on the curated, dynamically imported set.
 */
export const streamdownCodePlugin: CodeHighlighterPlugin = {
  getSupportedLanguages: () =>
    [...HIGHLIGHT_LANGUAGES] as unknown as BundledLanguage[],
  getThemes: () => ["one-light", "github-dark"],
  highlight: (options, callback) =>
    highlightCode(
      options.code,
      options.language as ShikiBundledLanguage,
      callback === undefined
        ? undefined
        : (result) => {
            callback(result);
          }
    ),
  name: "shiki",
  supportsLanguage: (language) => isHighlightableLanguage(language),
  type: "code-highlighter",
};
