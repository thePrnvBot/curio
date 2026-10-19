import { Output, generateText } from "ai";
import type { LanguageModel } from "ai";
import { Effect } from "effect";
import { z } from "zod";

import type { GeneratedArtifactBrief } from "../domain/artifact";
import { ArtifactGenerationFailed } from "../domain/artifact";
import type { ArtifactGeneratorContract } from "../services/artifact-generator";
import { CURIO_BASELINE_STYLE } from "./curio-baseline-style";

const ARTIFACT_BRIEF_SCHEMA = z.object({
  title: z
    .string()
    .min(1)
    .max(120)
    .describe("Human-facing artifact title, in Title Case"),
  filename: z
    .string()
    .min(1)
    .max(200)
    .describe(
      "Entry filename with a lowercase extension matching the artifact kind, e.g. index.html, poster.svg, report.md"
    ),
  mediaType: z
    .enum([
      "application/json",
      "application/xml",
      "image/svg+xml",
      "text/css",
      "text/html",
      "text/javascript",
      "text/markdown",
      "text/plain",
    ])
    .describe("IANA media type consistent with the filename extension"),
  content: z
    .string()
    .min(1)
    .describe(
      "The COMPLETE text content of the artifact file, ready to publish as-is. Never include markdown prose fences around the content."
    ),
  summary: z
    .string()
    .min(1)
    .max(400)
    .describe("One-or-two-sentence plain-language summary of the artifact"),
});

const GENERATOR_INSTRUCTIONS =
  "You produce the complete, publish-ready content of a single artifact file for the user's request. " +
  "Choose the most suitable format (HTML page, markdown document, SVG, CSS, JSON...). " +
  "The content must be finished and self-contained: include everything needed to open or read the file standalone. " +
  "Never wrap the content in markdown code fences.\n\n" +
  "AESTHETIC CONTRACT — for HTML artifacts, embed this exact baseline stylesheet inside <head> " +
  `and build on these variables (no other color values): 

${CURIO_BASELINE_STYLE}
` +
  "Design rules for HTML artifacts: generous whitespace and a single readable column (max-width: 45rem; margin: auto; padding: 2rem); " +
  "cards/pills use var(--card) or var(--muted) with 1px var(--border) borders and border-radius 10px; " +
  "text uses var(--muted-fg) for secondary copy; buttons use var(--primary) with var(--primary-fg) text; " +
  "no gradients, no drop shadows, no neon palettes, at most one accent color (the primary). " +
  "The artifact must look native in BOTH light and dark mode (the variables above handle it — never hard-code #fff/#000). " +
  "Keep markup semantic and minimal; interactivity should use plain DOM APIs. " +
  "For SVG artifacts use the same on both light and dark backgrounds: neutral strokes on a transparent background and restrained use of the primary hue oklch(0.508 0.118 165.612); " +
  "for markdown keep headings short, lists tight, and avoid decorative emoji.";

export interface GenerateTextArtifactGeneratorConfig {
  readonly resolveChatModel: Effect.Effect<LanguageModel>;
}

export function createGenerateTextArtifactGenerator(
  config: GenerateTextArtifactGeneratorConfig
): ArtifactGeneratorContract {
  return {
    generateArtifact: ({ prompt }: { prompt: string }) =>
      Effect.gen(function* generateArtifactBrief() {
        const model = yield* config.resolveChatModel;
        const structuredBrief: GeneratedArtifactBrief =
          yield* Effect.tryPromise({
            catch: (cause: unknown) =>
              new ArtifactGenerationFailed({ cause, prompt }),
            try: async () => {
              const generationResult = await generateText({
                instructions: GENERATOR_INSTRUCTIONS,
                model,
                output: Output.object({
                  description: "A complete, publish-ready artifact file.",
                  name: "ArtifactBrief",
                  schema: ARTIFACT_BRIEF_SCHEMA,
                }),
                prompt: `Create an artifact brief for this request:\n\n${prompt}`,
              });
              return generationResult.output;
            },
          });
        return structuredBrief;
      }),
  };
}
