import { Context } from "effect";
import type { Effect } from "effect";

import type { ArtifactGenerationFailed } from "../domain/artifact-generation-failed";
import type { GeneratedArtifactBrief } from "../domain/structured-generation-data";

export interface ArtifactGeneratorContract {
  /**
   * Turns a user prompt into a complete, validated artifact brief using
   * structured generation. Transport- and provider-neutral.
   */
  readonly generateArtifact: (input: {
    readonly prompt: string;
  }) => Effect.Effect<GeneratedArtifactBrief, ArtifactGenerationFailed>;
}

export class ArtifactGenerator extends Context.Service<
  ArtifactGenerator,
  ArtifactGeneratorContract
>()("curio/ArtifactGenerator") {}
