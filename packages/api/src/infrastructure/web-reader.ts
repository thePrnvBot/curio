import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { Effect } from "effect";

import { ObscuraUnavailable } from "./obscura-unavailable";
import { WebReadFailed } from "./web-read-failed";

export { ObscuraUnavailable } from "./obscura-unavailable";
export { WebReadFailed } from "./web-read-failed";

export const WEB_READ_TOOL_NAME = "web_read";

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

/**
 * Blocks every non-public IPv4 range the reader must never reach: "this"
 * network, private, loopback, carrier-grade NAT, link-local (including cloud
 * metadata at 169.254.169.254), benchmarking, multicast and reserved space.
 */
export function isBlockedIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const [first, second] = octets as [number, number, number, number];
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

/**
 * IPv6 is intentionally blocked conservatively: loopback, unspecified,
 * unique-local, link-local, and IPv4-mapped addresses (which could smuggle a
 * private IPv4 through `::ffff:`).
 */
export function isBlockedIpv6(hostname: string): boolean {
  const address = hostname.replaceAll(/^\[|\]$/gu, "").toLowerCase();
  if (address === "::" || address === "::1") {
    return true;
  }
  // Unique-local fc00::/7.
  if (address.startsWith("fc") || address.startsWith("fd")) {
    return true;
  }
  // Link-local fe80::/10.
  const firstGroup = Number.parseInt(address.split(":")[0] ?? "", 16);
  if (
    Number.isInteger(firstGroup) &&
    firstGroup >= 65_152 &&
    firstGroup <= 65_215
  ) {
    return true;
  }
  // NAT64 (64:ff9b::/96) embeds an IPv4 address.
  if (address.startsWith("64:ff9b:")) {
    return true;
  }
  // 6to4 (2002::/16) embeds an IPv4 address.
  if (address.startsWith("2002:")) {
    return true;
  }
  if (address.startsWith("::ffff:")) {
    const mapped = address.slice("::ffff:".length);
    if (mapped.includes(".")) {
      return isBlockedIpv4(mapped);
    }
    // Hex-mapped form (e.g. ::ffff:7f00:1) -> rebuild the dotted quad.
    const groups = mapped.split(":");
    if (groups.length === 2) {
      const high = Number.parseInt(groups[0] ?? "", 16);
      const low = Number.parseInt(groups[1] ?? "", 16);
      if (Number.isInteger(high) && Number.isInteger(low)) {
        const firstOctet = Math.floor(high / 256);
        const secondOctet = high % 256;
        const thirdOctet = Math.floor(low / 256);
        const fourthOctet = low % 256;
        return isBlockedIpv4(
          `${firstOctet}.${secondOctet}.${thirdOctet}.${fourthOctet}`
        );
      }
    }
    return true;
  }
  return false;
}

export function isPublicHttpUrl(candidate: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  const hostname = parsed.hostname
    .toLowerCase()
    .replaceAll(/^\[|\]$/gu, "")
    .replace(/\.$/u, "");

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home.arpa") ||
    hostname === "0.0.0.0"
  ) {
    return false;
  }

  // Decimal/hex/octal IPv4 spellings (e.g. 2130706433, 0x7f000001) are
  // interpreted by some resolvers as loopback; refuse anything that is not a
  // normal dotted quad or a real hostname.
  if (/^\d+$/u.test(hostname) || /^0x[\da-f]+$/iu.test(hostname)) {
    return false;
  }

  const ipVersion = isIP(hostname);
  if (ipVersion === 4) {
    return !isBlockedIpv4(hostname);
  }
  if (ipVersion === 6) {
    return !isBlockedIpv6(hostname);
  }
  return true;
}

/* ---------------------------- Redirect preflight --------------------------- */

const MAX_REDIRECT_HOPS = 5;
const REDIRECT_TIMEOUT_MS = 5000;

function isBlockedResolvedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    return isBlockedIpv4(address);
  }
  if (version === 6) {
    return isBlockedIpv6(address);
  }
  return true;
}

/**
 * Resolve a hostname and refuse the request when any returned address is
 * private, loopback, link-local or otherwise non-public. IP literals were
 * already checked by `isPublicHttpUrl`, so they skip DNS.
 */
async function assertPublicHostname(hostname: string): Promise<void> {
  const normalized = hostname.replaceAll(/^\[|\]$/gu, "").toLowerCase();
  if (isIP(normalized) !== 0) {
    return;
  }
  const addresses = await lookup(normalized, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error(`No DNS records for ${normalized}`);
  }
  for (const { address } of addresses) {
    if (isBlockedResolvedAddress(address)) {
      throw new Error(`${normalized} resolves to a non-public address`);
    }
  }
}

/**
 * Follow redirects with a cheap preflight and validate every hop before
 * Obscura fetches it. This cannot see client-side (JavaScript/meta-refresh)
 * redirects; egress filtering remains the stronger deployment-level control.
 *
 * The preflight deliberately sends no cookies or authorization headers.
 */
export async function resolvePublicRedirect(
  candidate: string
): Promise<string> {
  let current = candidate;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    if (!isPublicHttpUrl(current)) {
      throw new Error("Redirected to a non-public URL");
    }
    const parsed = new URL(current);
    // oxlint-disable-next-line eslint/no-await-in-loop -- redirect hops must be checked in order
    await assertPublicHostname(parsed.hostname);

    // oxlint-disable-next-line eslint/no-await-in-loop -- each hop depends on the previous response
    const response = await fetch(current, {
      // A Range request keeps the preflight cheap; cancel the body before
      // reading it. Some servers ignore Range, so cancel explicitly.
      headers: { Range: "bytes=0-0" },
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(REDIRECT_TIMEOUT_MS),
    });
    void response.body?.cancel();

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location === null) {
        return current;
      }
      current = new URL(location, current).toString();
      continue;
    }
    return current;
  }
  throw new Error(`Too many redirects (more than ${MAX_REDIRECT_HOPS})`);
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
    const timerState: { killTimer?: ReturnType<typeof setTimeout> } = {};
    const settle = (
      outcome: Effect.Effect<string, ObscuraSpawnFailed>
    ): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timerState.killTimer);
      resume(outcome);
    };
    timerState.killTimer = setTimeout(() => {
      settle(
        Effect.fail({
          message: `Obscura fetch timed out after ${timeoutMs}ms`,
          reason: "timeout",
        })
      );
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < MAX_SPAWN_OUTPUT_CHARS) {
        stdout += chunk.toString("utf-8");
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
      clearTimeout(timerState.killTimer);
      if (!child.killed) {
        child.kill();
      }
    });
  });

const obscuraFetchEffect = Effect.fnUntraced(function* obscuraFetchEffect(
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
export const webPageReadEffect = Effect.fnUntraced(function* webPageReadEffect(
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
  const resolvedUrl = yield* Effect.tryPromise({
    catch: (cause) =>
      new WebReadFailed({
        readFailureMessage: `Refusing to read a URL that redirects to a non-public host: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      }),
    try: () => resolvePublicRedirect(url),
  });
  const rawMarkdown = yield* obscuraFetchEffect([
    "fetch",
    resolvedUrl,
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
      ? `${trimmed.slice(0, WEB_READ_MAX_CHARS).trimEnd()}\n\n…`
      : trimmed,
    note: truncated
      ? "Page text was truncated; read again with a narrower source if key details are missing."
      : undefined,
    truncated,
    url: resolvedUrl,
  };
});

/** Promise-facing page reader for tools and tests; typed failures propagate. */
export const readWebPage = (
  url: string,
  selector?: string
): Promise<WebPageReadResult> =>
  Effect.runPromise(webPageReadEffect(url, selector));
