export class ModelOperationFailed extends Error {
  constructor(params: { cause: unknown; operation: string }) {
    super(
      `Model settings operation "${params.operation}" failed: ${describeModelCause(
        params.cause
      )}`
    );
    this.name = "ModelOperationFailed";
  }
}

function describeModelCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }
  return String(cause);
}
