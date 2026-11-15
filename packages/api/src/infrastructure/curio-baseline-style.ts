/**
 * The one design system for generated content.
 *
 * It serves three call sites:
 * - `CURIO_BASELINE_STYLE` is embedded verbatim by the lesson generator.
 * - `withCurioArtifactBaseline` injects it into HTML artifacts at publish time
 *   and again in the chat preview, so a model that ignores the prompt still
 *   lands on Curio's colours, type scale and components.
 * - `CURIO_ARTIFACT_DESIGN_RULES` is the prose half of the contract and is
 *   appended to the Director's instructions.
 *
 * Tokens mirror `packages/ui/src/styles/globals.css`: warm paper neutrals, a
 * monochrome action layer, and teal reserved for meaning (progress, completion,
 * live activity). Artifacts therefore sit inside the app instead of on top of
 * it. Everything resolves in light and dark, and the scheme can be forced to
 * match the app's class-based theme rather than the OS preference.
 */

const BASELINE_MARKER = "data-curio-baseline";
const SCHEME_MARKER = "data-curio-scheme";

const HEAD_OPEN = /<head(?:\s[^>]*)?>/iu;
const HTML_OPEN = /<html(?:\s[^>]*)?>/iu;
const DOCTYPE = /<!doctype[^>]*>/iu;

export type ArtifactColorScheme = "light" | "dark";

/** Component classes the design rules are allowed to name. */
export const CURIO_ARTIFACT_CLASSES = [
  "page",
  "eyebrow",
  "lede",
  "card",
  "grid",
  "pill",
  "pill--accent",
  "tag",
  "btn",
  "btn--ghost",
] as const;

const LIGHT_TOKENS = [
  "--bg:oklch(97.2% 0.008 150)",
  "--surface:oklch(98.8% 0.004 150)",
  "--muted:oklch(94.8% 0.008 150)",
  "--ink:oklch(28% 0.014 160)",
  "--ink-soft:oklch(51% 0.016 155)",
  "--line:oklch(90% 0.012 150)",
  "--accent:oklch(52% 0.11 160)",
  "--accent-ink:oklch(98% 0.01 160)",
].join(";");

const DARK_TOKENS = [
  "--bg:oklch(0% 0 0)",
  "--surface:oklch(13% 0.006 160)",
  "--muted:oklch(17% 0.006 160)",
  "--ink:oklch(93% 0.006 150)",
  "--ink-soft:oklch(68% 0.01 150)",
  "--line:oklch(100% 0 0 / 12%)",
  "--accent:oklch(78% 0.13 160)",
  "--accent-ink:oklch(8% 0.004 160)",
].join(";");

const BASELINE_CSS = `
:root{color-scheme:light dark;${LIGHT_TOKENS};--radius:12px;--measure:46rem;--font-sans:"Geist Variable",Geist,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--font-mono:"Geist Mono Variable",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
@media (prefers-color-scheme:dark){:root:not([data-curio-scheme="light"]){${DARK_TOKENS}}}
:root[data-curio-scheme="dark"]{color-scheme:dark;${DARK_TOKENS}}
:root[data-curio-scheme="light"]{color-scheme:light}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-sans);font-size:1rem;line-height:1.6;-webkit-font-smoothing:antialiased}
.page{max-width:var(--measure);margin:0 auto;padding:clamp(1.5rem,4vw,3rem) clamp(1.25rem,5vw,2rem) 4rem}
h1,h2,h3,h4{margin:0 0 .6rem;font-weight:600;line-height:1.15;letter-spacing:-.02em}
h1{font-size:clamp(1.7rem,1.2rem + 1.8vw,2.4rem);margin-bottom:1rem;letter-spacing:-.025em}
h2{font-size:1.3rem;letter-spacing:-.015em;margin-top:2.75rem}
h3{font-size:1.05rem;margin-top:1.75rem}
h4{font-size:.95rem;margin-top:1.5rem}
h1+h2,h2+h3,h3+h4,h2+p,h3+p{margin-top:.5rem}
p{margin:0 0 1rem;max-width:68ch}
.lede{margin:0 0 1.75rem;max-width:60ch;font-size:1.1rem;line-height:1.55;color:var(--ink-soft)}
.eyebrow{display:block;margin:0 0 .6rem;font-size:.7rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-soft)}
ul,ol{margin:0 0 1rem;padding-left:1.1rem;max-width:68ch}
li{margin:.3rem 0}
li::marker{color:var(--ink-soft)}
a{color:var(--accent);text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px}
a:hover{text-decoration-thickness:2px}
strong{font-weight:600}
small{font-size:.8rem;color:var(--ink-soft)}
hr{height:0;margin:2.5rem 0;border:0;border-top:1px solid var(--line)}
blockquote{margin:1.75rem 0;padding:.2rem 0 .2rem 1rem;border-left:2px solid var(--accent);color:var(--ink-soft)}
blockquote p{margin:0 0 .5rem}
.card{margin:0 0 1rem;padding:1.15rem 1.25rem;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius)}
.card>:last-child{margin-bottom:0}
.grid{display:grid;gap:.75rem;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));margin:1.25rem 0}
.grid>*{margin:0}
.pill,.tag{display:inline-flex;align-items:center;gap:.35rem;padding:.15rem .6rem;border:1px solid var(--line);border-radius:999px;font-size:.75rem;font-weight:500;line-height:1.5;color:var(--ink-soft);white-space:nowrap}
.pill--accent{border-color:var(--accent);color:var(--accent)}
.btn{display:inline-flex;align-items:center;gap:.4rem;padding:.5rem 1rem;border:1px solid transparent;border-radius:8px;background:var(--ink);color:var(--bg);font-size:.875rem;font-weight:500;line-height:1.2;text-decoration:none;cursor:pointer}
.btn:hover{opacity:.88}
.btn--ghost{background:transparent;border-color:var(--line);color:var(--ink)}
:where(a,button,input,select,textarea,summary,[tabindex]):focus-visible{outline:2px solid var(--accent);outline-offset:2px}
table{width:100%;margin:1.25rem 0;border-collapse:collapse;font-size:.9rem}
caption{margin-bottom:.5rem;font-size:.8rem;color:var(--ink-soft);text-align:left}
th{padding:.5rem .75rem .5rem 0;border-bottom:1px solid var(--line);font-size:.7rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-soft);text-align:left}
td{padding:.6rem .75rem .6rem 0;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}
code,kbd,samp{font-family:var(--font-mono);font-size:.875em}
code{padding:.12em .35em;border-radius:5px;background:var(--muted)}
pre{margin:0 0 1.25rem;padding:1rem;border:1px solid var(--line);border-radius:10px;background:var(--muted);overflow-x:auto}
pre code{padding:0;background:none;font-size:.85rem;line-height:1.6}
kbd{padding:.1em .4em;border:1px solid var(--line);border-radius:5px;background:var(--surface)}
img,video,canvas{display:block;max-width:100%;height:auto}
::selection{background:var(--accent);color:var(--accent-ink)}
`.trim();

/** The baseline stylesheet as a ready-to-embed `<style>` element. */
export const CURIO_BASELINE_STYLE = `<style ${BASELINE_MARKER}>\n${BASELINE_CSS}\n</style>\n`;

/**
 * The prose half of the contract: how to build an artifact that belongs in
 * Curio. Shared by the Director's chat instructions and the artifact
 * generator, so both paths describe the same system.
 */
export const CURIO_ARTIFACT_DESIGN_RULES = [
  "ARTIFACT DESIGN CONTRACT — an artifact must look like work a designer shipped, not like a generated template.",
  "",
  "1. Start from the content.",
  "- Write the real content the request implies: real headings, real sentences, the numbers the user actually gave you.",
  '- Never placeholder copy: no "Lorem ipsum", no "Your headline here", no "Company Name", no empty cards.',
  "- Never invent statistics, quotes, testimonials, logos, prices, dates, people, or citations. If a number is unknown, omit it or label it as an assumption.",
  "- No emoji anywhere, as decoration or as an icon. If a mark is essential, draw one inline SVG path in currentColor.",
  "",
  "2. Pick the smallest format that carries the request.",
  "- Document (report, explainer, summary, notes, spec, plan, letter): one column of text with headings, paragraphs, lists and tables. Never turn a document into a landing page.",
  "- Page (landing page, portfolio, dashboard, invitation, poster): only when the user asked for a page or a visual surface.",
  "- Markdown is the default for prose documents. HTML when the request needs layout, data tables or interaction. SVG for one graphic, logo, diagram or poster.",
  "",
  "3. Build on the baseline system; do not rebuild it.",
  "HTML artifacts automatically receive Curio's baseline stylesheet: colour tokens, one fluid type scale, and base styling for headings, p, ul, ol, blockquote, table, code, pre, hr and a. Use those elements and these classes instead of writing CSS per element:",
  '- <main class="page"> wraps the document: one column, max 46rem.',
  "- .eyebrow: small uppercase label above a heading.",
  "- .lede: the opening paragraph, larger and softer.",
  "- .card: a bordered panel holding one self-contained block.",
  "- .grid: responsive columns for 2-4 genuinely parallel items.",
  "- .pill and .tag: inline metadata chips; .pill--accent marks a live or completed state.",
  "- .btn and .btn--ghost: the monochrome action button.",
  "Add only the CSS the content genuinely needs, and never redeclare the tokens or the type scale.",
  "",
  "4. Typography.",
  "- One family, weights 400 and 600 only.",
  "- One h1, then h2 per section; never skip a level and never size a heading above 2.4rem.",
  "- Body copy stays left-aligned at 16px, 1.6 line-height, max 68ch.",
  "- All-caps is reserved for .eyebrow.",
  "",
  "5. Colour and depth.",
  "- Use the baseline tokens only. Never hard-code #fff, #000, rgba(), or named colours.",
  "- Teal (--accent) carries meaning: links, the current state, one emphasis marker. Never a large fill, never a gradient.",
  "- Primary actions are monochrome (--ink on --bg), not accent-coloured.",
  "- No gradients, box-shadows, glows, blurs or backdrop-filter. 1px --line borders do the separating.",
  "- Radius: 12px panels, 8px controls, 999px pills. Nothing else.",
  "- Everything must read correctly in both light and dark.",
  "",
  "6. Composition.",
  "- Left-aligned by default. Centring is for a single poster-style title, never for body copy or lists.",
  "- Space sections with 2.5-3rem margins; do not draw a rule between every block.",
  "- Cards are for parallel items. Prose stays prose; never wrap every paragraph in a card.",
  "- No decorative hero with a big title and three feature cards unless the request really is a marketing page.",
  "",
  "7. Interaction (HTML).",
  "- Plain DOM APIs in one inline <script> at the end of body. No frameworks, no CDN or network requests, no external fonts or images.",
  "- Every control gets a real label, a sensible default state, and the baseline focus ring.",
  "",
  "8. SVG.",
  "- Transparent background, currentColor or neutral strokes, restrained oklch(0.52 0.11 160). No gradients, filters, shadows or embedded raster images.",
  "",
  "9. Markdown.",
  "- Short headings, tight lists, tables for comparisons. No decorative horizontal rules and no emoji.",
].join("\n");

function schemeScript(scheme: ArtifactColorScheme): string {
  return `<script ${SCHEME_MARKER}>document.documentElement.setAttribute("data-curio-scheme","${scheme}");</script>\n`;
}

/** Splices `insertion` into `html` at `index`, leaving the rest untouched. */
function insertAt(html: string, index: number, insertion: string): string {
  return html.slice(0, index) + insertion + html.slice(index);
}

/**
 * Guarantees the baseline stylesheet (and, when given, an exact colour scheme)
 * on an HTML artifact. Idempotent: a document that already carries one is
 * returned unchanged. The payload is inserted before the artifact's own styles
 * so anything the artifact deliberately styles still wins.
 */
export function withCurioArtifactBaseline(
  html: string,
  scheme?: ArtifactColorScheme
): string {
  const needsStyle = !html.includes(BASELINE_MARKER);
  const needsScheme = scheme !== undefined && !html.includes(SCHEME_MARKER);
  if (!needsStyle && !needsScheme) {
    return html;
  }

  const insertion =
    (needsStyle ? CURIO_BASELINE_STYLE : "") +
    (needsScheme ? schemeScript(scheme) : "");

  const headOpen = HEAD_OPEN.exec(html);
  if (headOpen !== null) {
    return insertAt(html, headOpen.index + headOpen[0].length, insertion);
  }
  const htmlOpen = HTML_OPEN.exec(html);
  if (htmlOpen !== null) {
    return insertAt(html, htmlOpen.index + htmlOpen[0].length, insertion);
  }
  // Inserting before the doctype would drop the document into quirks mode.
  const doctype = DOCTYPE.exec(html);
  if (doctype !== null) {
    return insertAt(html, doctype.index + doctype[0].length, insertion);
  }
  return insertion + html;
}
