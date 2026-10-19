/**
 * One formatter for every domain error's `message` getter: turns an unknown
 * failure cause into a single human-readable line, unwrapping nested
 * `Error.cause` chains and preferring gateway payloads that already carry
 * plain `errorText` over their raw JSON.
 */

/** Cap on nested `Error.cause` unwrapping, to survive cyclic cause chains. */
const MAX_CAUSE_NESTING_DEPTH = 4;

export function describeCause(cause: unknown, nestingDepth = 0): string {
  if (typeof cause === "string") {
    return cause;
  }
  if (cause instanceof Error) {
    const errorDescription = `${cause.name}: ${cause.message}`;
    if (nestingDepth >= MAX_CAUSE_NESTING_DEPTH) {
      return errorDescription;
    }
    if ("cause" in cause && cause.cause !== undefined && cause.cause !== null) {
      return `${errorDescription} (${describeCause(cause.cause, nestingDepth + 1)})`;
    }
    return errorDescription;
  }
  if (cause !== null && typeof cause === "object") {
    const errorText = "errorText" in cause ? cause.errorText : undefined;
    return typeof errorText === "string" ? errorText : JSON.stringify(cause);
  }
  return "unknown cause";
}
