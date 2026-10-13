export class CourseOperationFailed extends Error {
  constructor(params: { cause: unknown; operation: string }) {
    super(
      `Course operation "${params.operation}" failed: ${describeCourseCause(
        params.cause
      )}`
    );
    this.name = "CourseOperationFailed";
  }
}

function describeCourseCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }
  return String(cause);
}
