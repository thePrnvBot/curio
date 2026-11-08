const isProduction =
  typeof process !== "undefined" && process.env?.NODE_ENV === "production";

type LogLevel = "debug" | "error" | "info" | "warn";

/** Errors do not survive `JSON.stringify` by default; keep their shape. */
function serializeArgument(argument: unknown): unknown {
  if (argument instanceof Error) {
    return {
      message: argument.message,
      name: argument.name,
      stack: argument.stack,
    };
  }
  return argument;
}

function emit(
  level: LogLevel,
  message: string,
  args: readonly unknown[]
): void {
  if (level === "debug" && isProduction) {
    return;
  }
  if (isProduction) {
    // One JSON object per line keeps deployment logs queryable without
    // pulling a logging dependency into the worker/SSR bundle.
    console[level](
      JSON.stringify({
        args: args.map(serializeArgument),
        level,
        message,
        time: new Date().toISOString(),
      })
    );
    return;
  }
  console[level](message, ...args);
}

/**
 * Isomorphic logger used by server routes and client error paths. In
 * production it emits one structured JSON line per event; in development it
 * stays readable in the terminal.
 */
export const logger = {
  debug: (message: string, ...args: unknown[]): void => {
    emit("debug", message, args);
  },
  error: (message: string, error: unknown, ...args: unknown[]): void => {
    emit("error", message, [error, ...args]);
  },
  info: (message: string, ...args: unknown[]): void => {
    emit("info", message, args);
  },
  warn: (message: string, ...args: unknown[]): void => {
    emit("warn", message, args);
  },
};
