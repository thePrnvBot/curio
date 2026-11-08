import { ArtifactGenerator } from "@curio/api/services/artifact-generator";
import { ArtifactPublisher } from "@curio/api/services/artifact-publisher";
import { ChatStore } from "@curio/api/services/chat-store";
import { createFileRoute } from "@tanstack/react-router";
import type { UIMessage } from "ai";
import { Effect, Option } from "effect";
import { z } from "zod";

import { curioFeatures, curioRuntime } from "../../../services";
import {
  requestSession,
  unauthorizedResponse,
} from "../../../utils/api-session";
import { logger } from "../../../utils/logger";
import { checkRateLimit, rateLimitResponse } from "../../../utils/rate-limit";
import { withSecurityHeaders } from "../../../utils/security-headers";

const artifactGenerationRequestSchema = z.object({
  chatId: z.string().min(1).max(64),
  prompt: z.string().min(1).max(20_000),
});

function secureJson(body: unknown, init?: ResponseInit): Response {
  return withSecurityHeaders(Response.json(body, init));
}

export const Route = createFileRoute("/api/artifacts/generate")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const sessionOption = await requestSession(request);
        if (Option.isNone(sessionOption)) {
          return withSecurityHeaders(unauthorizedResponse());
        }

        const rateLimit = checkRateLimit(
          `artifact:${sessionOption.value.user.id}`,
          {
            limit: 10,
            windowMs: 60_000,
          }
        );
        if (!rateLimit.allowed) {
          return withSecurityHeaders(rateLimitResponse(rateLimit.headers));
        }

        if (!curioFeatures.artifactPublishingEnabled) {
          return secureJson(
            { error: "Artifact publishing is not configured" },
            { status: 501 }
          );
        }

        let requestBody: unknown;
        try {
          requestBody = await request.json();
        } catch {
          return secureJson(
            { error: "Invalid artifact generation request" },
            { status: 400 }
          );
        }

        const parsedRequestBody =
          artifactGenerationRequestSchema.safeParse(requestBody);

        if (!parsedRequestBody.success) {
          return secureJson(
            { error: "Invalid artifact generation request" },
            { status: 400 }
          );
        }

        const { chatId, prompt } = parsedRequestBody.data;
        const userId = sessionOption.value.user.id;

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

              // The inline card is part of the transcript, not a client-only
              // decoration: persist it before answering so a reload keeps it.
              const messageId = `msg-artifact-${crypto.randomUUID()}`;
              const artifactMessage: UIMessage = {
                id: messageId,
                parts: [
                  {
                    data: {
                      content: brief.content,
                      mediaType: brief.mediaType,
                      reviewUrl: publication.links.review,
                      summary: brief.summary,
                      title: brief.title,
                    },
                    type: "data-artifact",
                  },
                ],
                role: "assistant",
              };
              const chatStore = yield* ChatStore;
              yield* chatStore.ensureChatForUser(chatId, userId);
              yield* chatStore.appendMessage(chatId, userId, artifactMessage);

              return { brief, messageId, publication };
            })
          );

          return secureJson({
            brief: generationAndPublication.brief,
            links: generationAndPublication.publication.links,
            messageId: generationAndPublication.messageId,
          });
        } catch (error: unknown) {
          logger.error("Artifact generation failed", error);
          return secureJson(
            { error: "Failed to generate or publish the artifact" },
            { status: 502 }
          );
        }
      },
    },
  },
});
