import { tool } from "ai";
import type { ToolSet } from "ai";
import { Effect } from "effect";
import { z } from "zod";

import type { ArtifactPublisherContract } from "../services/artifact-publisher";

export const CREATE_ARTIFACT_TOOL_NAME = "create_artifact";

/** Entry-filename extensions the artifact server accepts, with their IANA media types. */
const MEDIA_TYPES_BY_EXTENSION = {
  css: "text/css",
  html: "text/html",
  js: "text/javascript",
  json: "application/json",
  md: "text/markdown",
  svg: "image/svg+xml",
  txt: "text/plain",
  xml: "application/xml",
} as const;

type KnownArtifactExtension = keyof typeof MEDIA_TYPES_BY_EXTENSION;

/** Derives the media type from the filename's extension; unknown extensions fall back to the explicit mediaType input. */
function guessMediaType(filename: string): string | undefined {
  const extension = filename.split(".").at(-1)?.toLowerCase();
  if (extension === undefined) {
    return undefined;
  }
  return extension in MEDIA_TYPES_BY_EXTENSION
    ? MEDIA_TYPES_BY_EXTENSION[extension as KnownArtifactExtension]
    : undefined;
}

export function createArtifactTool(
  artifactPublisher: ArtifactPublisherContract
): ToolSet {
  return {
    [CREATE_ARTIFACT_TOOL_NAME]: tool({
      description:
        "Publish a finished artifact (an HTML page, markdown document, SVG, or other text document) to the artifact server. " +
        "Return the review link to the user with your answer so they can view and comment on the exact saved version.",
      execute: async ({ content, filename, mediaType, title }) => {
        const resolvedMediaType =
          mediaType ?? guessMediaType(filename) ?? "text/plain";

        // The typed ArtifactPublishFailed rejects the promise directly —
        // mapError theater here only re-raised the same error unhandled.
        return await Effect.runPromise(
          artifactPublisher.publish({
            content,
            entryFilename: filename,
            mediaType: resolvedMediaType,
            title,
          })
        );
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
