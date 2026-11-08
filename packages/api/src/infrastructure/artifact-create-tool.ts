import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";

import type {
  ArtifactPublicationInput,
  ArtifactPublicationResult,
} from "../domain/artifact";
import { guessMediaTypeFromFilename } from "../domain/artifact";

export const CREATE_ARTIFACT_TOOL_NAME = "create_artifact";

/** Async publisher the AI tool executes; the app wires this to its runtime. */
export interface ArtifactPublisherFunction {
  readonly publish: (
    input: ArtifactPublicationInput
  ) => Promise<ArtifactPublicationResult>;
}

export function createArtifactTool(
  publishArtifact: ArtifactPublisherFunction
): ToolSet {
  return {
    [CREATE_ARTIFACT_TOOL_NAME]: tool({
      description:
        "Publish a finished artifact (an HTML page, markdown document, SVG, or other text document) to the artifact server. " +
        "Return the review link to the user with your answer so they can view and comment on the exact saved version.",
      execute: async ({ content, filename, mediaType, title }) => {
        const resolvedMediaType =
          mediaType ?? guessMediaTypeFromFilename(filename) ?? "text/plain";

        return await publishArtifact.publish({
          content,
          entryFilename: filename,
          mediaType: resolvedMediaType,
          title,
        });
      },
      inputSchema: z.object({
        content: z
          .string()
          .min(1)
          .describe("The full text content of the artifact file"),
        filename: z
          .string()
          .min(1)
          .describe("Entry filename, e.g. index.html, report.md, design.svg"),
        mediaType: z
          .string()
          .optional()
          .describe(
            "Optional IANA media type; inferred from the filename when omitted"
          ),
        title: z.string().min(1).describe("Human-facing artifact title"),
      }),
    }),
  };
}
