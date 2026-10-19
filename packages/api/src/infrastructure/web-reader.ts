import { spawn, type ChildProcess } from "node:child_process";

import { Data, Effect } from "effect";

export const WEB_READ_TOOL_NAME = "web_read";

export class ObscuraUnavailable extends Data.TaggedError("ObscuraUnavailable")<{
  readonly message: string;
}> {}

export class WebReadFailed extends Data.TaggedError("WebReadFailed")<{
  readonly readFailureMessage: string;
}> {
  override get message(): string {
    return this.readFailureMessage;
  }
}

export interface WebPageReadResult {
  readonly markdown: string;
  readonly note?: string;
  readonly truncated: boolean;
  readonly url: string;
}

/* ------------------------------- Obscura read ------------------------------ */

/**
 * Web read tier: render a page with the Obscura browser engine and return
 * clean markdown. The binary is expected on PATH (or OBSCURA_BIN); an absent
 * binary is an `ObscuraUnavailable` so the tool can explain the install
 * instead of leaking a stack trace.
 */

const OBSCURA_DEFAULT_TIMEOUT_MS = 45_000;
const WEB_READ_MAX_CHARS = 12_000;
const MAX_SPAWN_OUTPUT_CHARS = 1_000_000;

function isPublicHttpUrl(candidate: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    hostname === "::1" ||
    hostname === "0.0.0.0"
  ) {
    return false;
  }
  return true;
}

function obscuraBinaryCandidates(): readonly string[] {
  const configured = process.env.OBSCURA_BIN?.trim();
  if (configured !== undefined && configured !== "") {
    return [configured, "obscura", "obscura.exe"];
  }
  return ["obscura", "obscura.exe"];
}

interface ObscuraSpawnFailed {
  readonly message: string;
  readonly reason: "binary-missing" | "exit" | "timeout";
}

/** One attempt to run the Obscura CLI: interruption-safe via the callback's
 * finalizer (kill the child + clear the timeout on cancel). */
const spawnObscuraEffect = (
  binary: string,
  args: readonly string[],
  timeoutMs: number
): Effect.Effect<string, ObscuraSpawnFailed> =>
  Effect.callback((resume) => {
    const child: ChildProcess = spawn(binary, args, {
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let settled = false;
    const settle = (
      outcome: Effect.Effect<string, ObscuraSpawnFailed>
    ): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(killTimer);
      resume(outcome);
    };
    const killTimer = setTimeout(() => {
      settle(
        Effect.fail({
          message: `Obscura fetch timed out after ${timeoutMs}ms`,
          reason: "timeout",
        })
      );
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < MAX_SPAWN_OUTPUT_CHARS) {
        stdout += chunk.toString("utf8");
      }
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      settle(
        Effect.fail({
          message:
            error.code === "ENOENT"
              ? `${binary}: not found`
              : `Obscura spawn failed: ${error.message}`,
          reason: error.code === "ENOENT" ? "binary-missing" : "exit",
        })
      );
    });
    child.on("close", (code: number | null) => {
      if (code === 0) {
        settle(Effect.succeed(stdout));
      } else {
        settle(
          Effect.fail({
            message: `Obscura exited with code ${code ?? "signal"}`,
            reason: "exit",
          })
        );
      }
    });

    // Finalizer: interruption (or runtime shutdown) tears the child down.
    return Effect.sync(() => {
      clearTimeout(killTimer);
      if (!child.killed) {
        child.kill();
      }
    });
  });

const obscuraFetchEffect = Effect.fnUntraced(function* (
  args: readonly string[]
): Effect.fn.Return<string, ObscuraUnavailable | WebReadFailed> {
  let lastFailure: ObscuraSpawnFailed | undefined;
  for (const binary of obscuraBinaryCandidates()) {
    const attempt = yield* Effect.result(
      spawnObscuraEffect(binary, args, OBSCURA_DEFAULT_TIMEOUT_MS)
    );
    if (attempt._tag === "Success") {
      return attempt.success;
    }
    lastFailure = attempt.failure;
    if (attempt.failure.reason !== "binary-missing") {
      return yield* Effect.fail(
        new WebReadFailed({ readFailureMessage: attempt.failure.message })
      );
    }
  }
  return yield* Effect.fail(
    new ObscuraUnavailable({
      message: `Obscura binary was not found (${
        lastFailure?.message ?? "no install candidates"
      })`,
    })
  );
});

/** Render a public URL with Obscura and return truncation-aware markdown.
 * `selector` optionally narrows extraction to a CSS region (main, article)
 * per the Obscura RAG guidance for skipping nav, sidebars and footers. */
export const webPageReadEffect = Effect.fnUntraced(function* (
  url: string,
  selector?: string
): Effect.fn.Return<WebPageReadResult, ObscuraUnavailable | WebReadFailed> {
  if (!isPublicHttpUrl(url)) {
    return yield* Effect.fail(
      new WebReadFailed({
        readFailureMessage: "Only public http(s) URLs can be read.",
      })
    );
  }
  const rawMarkdown = yield* obscuraFetchEffect([
    "fetch",
    url,
    "--dump",
    "markdown",
    "-q",
    "--obey-robots",
    // Only stealth-enabled builds accept this flag; opt in via env.
    ...(process.env.OBSCURA_STEALTH === "1" ? ["--stealth"] : []),
    ...(selector !== undefined && selector.trim() !== ""
      ? ["--selector", selector.trim(), "--timeout", "45"]
      : ["--timeout", "35"]),
  ]);
  const trimmed = rawMarkdown.trim();
  const truncated = trimmed.length > WEB_READ_MAX_CHARS;
  return {
    markdown: truncated
      ? `${trimmed.slice(0, WEB_READ_MAX_CHARS).trimEnd()}` + "\n\n…"
      : trimmed,
    note: truncated
      ? "Page text was truncated; read again with a narrower source if key details are missing."
      : undefined,
    truncated,
    url,
  };
});

/** Promise-facing page reader for tools and tests; typed failures propagate. */
export const readWebPage = (
  url: string,
  selector?: string
): Promise<WebPageReadResult> =>
  Effect.runPromise(webPageReadEffect(url, selector));
