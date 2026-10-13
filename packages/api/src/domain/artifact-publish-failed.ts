import { Data } from "effect";

function hasErrorText(value: object): value is { errorText?: unknown } {
  return "errorText" in value;
}

function describeRootCause(cause: unknown, depth = 0): string {
  if (typeof cause === "string") {
    return cause;
  }
  if (cause instanceof Error) {
    const parentDescription = `${cause.name}: ${cause.message}`;
    const hasNestedCause =
      "cause" in cause && cause.cause !== undefined && cause.cause !== null;
    if (hasNestedCause && depth < 4) {
      return `${parentDescription} (${describeRootCause(cause.cause, depth + 1)})`;
    }
    return parentDescription;
  }
  if (cause !== null && typeof cause === "object") {
    const errorText = hasErrorText(cause) ? cause.errorText : undefined;
    return typeof errorText === "string" ? errorText : JSON.stringify(cause);
  }
  if (cause === undefined || cause === null) {
    return "unknown cause";
  }
  return JSON.stringify(cause);
}

export class ArtifactPublishFailed extends Data.TaggedError(
  "ArtifactPublishFailed"
)<{
  readonly title: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Failed to publish artifact "${this.title}" — ${describeRootCause(
      this.cause
    )}`;
  }
}
