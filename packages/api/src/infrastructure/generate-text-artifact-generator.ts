import { Output, generateText } from "ai";
import type { LanguageModel } from "ai";
import { Effect } from "effect";
import { z } from "zod";

import type { GeneratedArtifactBrief } from "../domain/artifact";
import { ArtifactGenerationFailed } from "../domain/artifact";
import type { ArtifactGeneratorContract } from "../services/artifact-generator";
import {
  CURIO_ARTIFACT_DESIGN_RULES,
  withCurioArtifactBaseline,
} from "./curio-baseline-style";

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
  `You produce the complete, publish-ready content of a single artifact file for the user's request. ` +
  `Choose the most suitable format (HTML page, markdown document, SVG, CSS, JSON...). ` +
  `The content must be finished and self-contained: include everything needed to open or read the file standalone. ` +
  `Never wrap the content in markdown code fences.

${CURIO_ARTIFACT_DESIGN_RULES}`;

/** The baseline stylesheet is guaranteed on HTML regardless of the model. */
function withBaselineContent(
  brief: GeneratedArtifactBrief
): GeneratedArtifactBrief {
  if (brief.mediaType !== "text/html") {
    return brief;
  }
  return { ...brief, content: withCurioArtifactBaseline(brief.content) };
}

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
        return withBaselineContent(structuredBrief);
      }),
  };
}
