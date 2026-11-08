import { Data, Effect, Option } from "effect";

import type { GeneratedArtifactResponseView } from "@/utils/chat-schemas";
import {
  decodeGeneratedArtifactError,
  toGeneratedArtifactResponse,
} from "@/utils/chat-schemas";

/**
 * The client half of artifact publishing: one POST to the generation
 * endpoint, with every failure mode declared in the Effect error channel as
 * a typed error instead of ad-hoc `{ ok: false }` unions. The endpoint's
 * response is untrusted and decoded ONCE through the shared chat schemas
 * before anything else sees it, so malformed payloads are typed failures,
 * never raw casts.
 */

const ARTIFACT_GENERATION_ENDPOINT = "/api/artifacts/generate";

/** The POST failed (network error, abort) or the endpoint's payload was not
 * a well-formed generated artifact; `detail` is the user-facing explanation. */
export class ArtifactGenerationFailed extends Data.TaggedError(
  "ArtifactGenerationFailed"
)<{
  readonly detail: string;
  readonly stage: "request" | "response";
}> {}

export const generateArtifact = Effect.fn("chat-artifact.generate")(
  function* publishArtifact(
    chatId: string,
    promptText: string
  ): Effect.fn.Return<GeneratedArtifactResponseView, ArtifactGenerationFailed> {
    const generationResponse = yield* Effect.tryPromise({
      catch: () =>
        new ArtifactGenerationFailed({
          detail: "Artifact generation request did not complete",
          stage: "request",
        }),
      // The signal a caller passed to runPromise aborts the request with it.
      try: (requestAbortSignal) =>
        fetch(ARTIFACT_GENERATION_ENDPOINT, {
          body: JSON.stringify({ chatId, prompt: promptText }),
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          method: "POST",
          signal: requestAbortSignal,
        }),
    });

    // The single trusted-unknown boundary: the HTTP body is untrusted until
    // the shared chat schemas decode it below this line.
    const untrustedResponseBody: unknown = yield* Effect.promise(() =>
      generationResponse.json().catch(() => null)
    );

    if (!generationResponse.ok) {
      return yield* new ArtifactGenerationFailed({
        detail: Option.getOrElse(
          decodeGeneratedArtifactError(untrustedResponseBody),
          () => `Request failed (${generationResponse.status})`
        ),
        stage: "request",
      });
    }

    return yield* Effect.fromOption(
      toGeneratedArtifactResponse(untrustedResponseBody),
      () =>
        new ArtifactGenerationFailed({
          detail: "Artifact generation returned a malformed response",
          stage: "response",
        })
    );
  }
);
