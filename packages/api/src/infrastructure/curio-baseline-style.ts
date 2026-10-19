/**
 * Baseline stylesheet every generated HTML artifact embeds: OKLCH design
 * tokens that resolve for both light and dark schemes, so prompts only need
 * to reference the variables instead of hard-coded colors.
 */
export const CURIO_BASELINE_STYLE =
  "<style>\n" +
  "  :root {\n" +
  "    color-scheme: light dark;\n" +
  "    --bg: oklch(100% 0 0);\n" +
  "    --fg: oklch(14.8% 0.004 228.8);\n" +
  "    --card: oklch(100% 0 0);\n" +
  "    --muted: oklch(96.3% 0.002 197.1);\n" +
  "    --muted-fg: oklch(56% 0.021 213.5);\n" +
  "    --border: oklch(92.5% 0.005 214.3);\n" +
  "    --primary: oklch(50.8% 0.118 165.6);\n" +
  "    --primary-fg: oklch(97.9% 0.021 166.1);\n" +
  "  }\n" +
  "  @media (prefers-color-scheme: dark) {\n" +
  "    :root {\n" +
  "      --bg: oklch(14.8% 0.004 228.8);\n" +
  "      --fg: oklch(98.7% 0.002 197.1);\n" +
  "      --card: oklch(21.8% 0.008 223.9);\n" +
  "      --muted: oklch(27.5% 0.011 216.9);\n" +
  "      --muted-fg: oklch(72.3% 0.014 214.4);\n" +
  "      --border: oklch(100% 0 0 / 10%);\n" +
  "      --primary: oklch(43.2% 0.095 166.9);\n" +
  "      --primary-fg: oklch(97.9% 0.021 166.1);\n" +
  "    }\n" +
  "  }\n" +
  "  body { margin: 0; background: var(--bg); color: var(--fg); font-family: 'Geist', ui-sans-serif, system-ui, sans-serif; font-size: 15px; line-height: 1.55; -webkit-font-smoothing: antialiased; }\n" +
  "  h1, h2, h3 { line-height: 1.2; letter-spacing: -0.01em; }\n" +
  "  a { color: var(--primary); }\n" +
  "  button, input, select, textarea { font: inherit; }\n" +
  "</style>\n";
