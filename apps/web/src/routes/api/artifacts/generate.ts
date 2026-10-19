import { ArtifactGenerator } from "@curio/api/services/artifact-generator";
import { ArtifactPublisher } from "@curio/api/services/artifact-publisher";
import { createFileRoute } from "@tanstack/react-router";
import { Effect, Option } from "effect";
import { z } from "zod";

import { curioFeatures, curioRuntime } from "../../../services";
import {
  requestSession,
  unauthorizedResponse,
} from "../../../utils/api-session";

const artifactGenerationRequestSchema = z.object({
  prompt: z.string().min(1).max(20_000),
});

export const Route = createFileRoute("/api/artifacts/generate")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const sessionOption = await requestSession(request);
        if (Option.isNone(sessionOption)) {
          return unauthorizedResponse();
        }

        if (!curioFeatures.artifactPublishingEnabled) {
          return Response.json(
            { error: "Artifact publishing is not configured" },
            { status: 501 }
          );
        }

        const parsedRequestBody = artifactGenerationRequestSchema.safeParse(
          await request.json()
        );

        if (!parsedRequestBody.success) {
          return Response.json(
            { error: "Invalid artifact generation request" },
            { status: 400 }
          );
        }

        const { prompt } = parsedRequestBody.data;

        try {
          const generationAndPublication = await curioRuntime.runPromise(
            Effect.gen(function* generateAndPublishArtifact() {
              const artifactGenerator = yield* ArtifactGenerator;
              const brief = yield* artifactGenerator.generateArtifact({
                prompt,
              });
              const artifactPublisher = yield* ArtifactPublisher;
              const publication = yield* artifactPublisher.publish({
                content: brief.content,
                entryFilename: brief.filename,
                mediaType: brief.mediaType,
                title: brief.title,
              });
              return { brief, publication };
            })
          );

          return Response.json({
            brief: generationAndPublication.brief,
            links: generationAndPublication.publication.links,
          });
        } catch (error: unknown) {
          console.error("Artifact generation failed", error);
          return Response.json(
            { error: "Failed to generate or publish the artifact" },
            { status: 502 }
          );
        }
      },
    },
  },
});
