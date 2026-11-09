// oxlint-disable eslint/max-classes-per-file -- domain failures are intentionally colocated
import { Data } from "effect";

import { describeCause } from "./cause-description";

export class ModelOperationFailed extends Data.TaggedError(
  "ModelOperationFailed"
)<{
  readonly operation: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Model settings operation "${this.operation}" failed: ${describeCause(
      this.cause
    )}`;
  }
}

/**
 * A user-chosen OpenAI-compatible endpoint has no user-supplied API key.
 * The server key is never a fallback for a host the user controls, so this
 * fails closed instead of forwarding the deployment credential.
 */
export class ModelCredentialRequired extends Data.TaggedError(
  "ModelCredentialRequired"
)<{
  readonly provider: string;
  readonly baseUrl: string;
}> {
  override get message(): string {
    return `A personal API key is required for the custom ${this.provider} endpoint ${this.baseUrl}.`;
  }
}
