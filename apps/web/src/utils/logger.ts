const isProduction =
  typeof process !== "undefined" && process.env?.NODE_ENV === "production";

/**
 * Isomorphic logger. Currently delegates to `console` so failures are visible
 * in deployment logs without adding a dependency. Replace with a structured
 * logger (e.g. pino) when log aggregation is wired up.
 */
export const logger = {
  debug: (message: string, ...args: unknown[]): void => {
    if (!isProduction) {
      console.debug(message, ...args);
    }
  },
  error: (message: string, error: unknown, ...args: unknown[]): void => {
    console.error(message, error, ...args);
  },
  info: (message: string, ...args: unknown[]): void => {
    console.info(message, ...args);
  },
  warn: (message: string, ...args: unknown[]): void => {
    console.warn(message, ...args);
  },
};
