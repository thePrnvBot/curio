import { Context } from "effect";
import type { Effect } from "effect";

import type {
  ArtifactPublicationInput,
  ArtifactPublicationResult,
  ArtifactPublishFailed,
} from "../domain/artifact";

export interface ArtifactPublisherContract {
  /**
   * Publishes one artifact version and returns its immutable identity and
   * review links. The contract is transport-neutral: implementations may use
   * MCP, HTTP, or any backend.
   */
  readonly publish: (
    input: ArtifactPublicationInput
  ) => Effect.Effect<ArtifactPublicationResult, ArtifactPublishFailed>;
}

export class ArtifactPublisher extends Context.Service<
  ArtifactPublisher,
  ArtifactPublisherContract
>()("curio/ArtifactPublisher") {}
