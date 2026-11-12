import { trimUrlPunctuation } from "@/utils/links";

/**
 * A GitHub repository link reduced to the parts the chat UI needs: the
 * original destination plus the `owner/repo` label shown on the chip.
 */
export interface GitHubRepoRef {
  /** Destination to open and to send to the Director. */
  readonly href: string;
  readonly owner: string;
  readonly repo: string;
  /** `owner/repo` — also the chip label. */
  readonly slug: string;
}

const GITHUB_HOST_PATTERN = /^(?:www\.)?github\.com$/iu;
const REPO_SEGMENT_PATTERN = /^[\w.-]+$/u;
// Matches with or without a scheme so an address-bar paste (`github.com/a/b`)
// still becomes a chip. The lookbehind keeps `notgithub.com/a/b` out.
const GITHUB_URL_PATTERN =
  /(?<![\w.-])(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s<>"'`]+/giu;
const SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:\/\//iu;

/**
 * GitHub hosts a few first-level pages that look like `owner/repo` URLs
 * (`/features/actions`, `/settings/appearance`). Treating those as
 * repositories would chip site pages, so their owner segment is rejected.
 */
const RESERVED_OWNERS = new Set([
  "about",
  "account",
  "apps",
  "collections",
  "contact",
  "customer-stories",
  "dashboard",
  "discussions",
  "enterprise",
  "events",
  "explore",
  "features",
  "issues",
  "join",
  "login",
  "logout",
  "marketplace",
  "new",
  "notifications",
  "organizations",
  "orgs",
  "pricing",
  "pulls",
  "readme",
  "search",
  "security",
  "sessions",
  "settings",
  "signup",
  "site",
  "sponsors",
  "topics",
  "trending",
  "users",
]);

/**
 * Parses a GitHub repository URL. Deep links (`/tree/main/src`), `.git`
 * suffixes and `www.` hosts all resolve to the same `owner/repo` chip, while
 * the original destination is kept for opening and sending.
 */
export function parseGitHubRepoRef(candidate: string): GitHubRepoRef | null {
  const trimmed = candidate.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const href = SCHEME_PATTERN.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }
  if (!GITHUB_HOST_PATTERN.test(parsed.hostname)) {
    return null;
  }

  const [owner, repoWithSuffix] = parsed.pathname
    .split("/")
    .filter((segment) => segment.length > 0);
  if (
    owner === undefined ||
    repoWithSuffix === undefined ||
    !REPO_SEGMENT_PATTERN.test(owner)
  ) {
    return null;
  }
  if (RESERVED_OWNERS.has(owner.toLowerCase())) {
    return null;
  }

  const repo = repoWithSuffix.replace(/\.git$/iu, "");
  if (repo.length === 0 || !REPO_SEGMENT_PATTERN.test(repo)) {
    return null;
  }

  return { href, owner, repo, slug: `${owner}/${repo}` };
}

/** True when two references point at the same `owner/repo` pair. */
export function isSameGitHubRepo(
  left: GitHubRepoRef,
  right: GitHubRepoRef
): boolean {
  return left.slug.toLowerCase() === right.slug.toLowerCase();
}

/**
 * Collapses the gaps left behind after links are pulled out of pasted text.
 */
function tidyWhitespace(text: string): string {
  return text
    .replaceAll(/[ \t]{2,}/gu, " ")
    .replaceAll(/[ \t]+\n/gu, "\n")
    .replaceAll(/\n[ \t]+/gu, "\n")
    .trim();
}

/**
 * Pulls GitHub repository links out of pasted text. Extracted links are
 * removed from `remainingText` so the composer only shows the chip, while the
 * surrounding prose is kept at the paste position.
 */
export function extractGitHubRepoRefs(text: string): {
  readonly repos: readonly GitHubRepoRef[];
  readonly remainingText: string;
} {
  const repos: GitHubRepoRef[] = [];
  let remainingText = text;

  for (const match of text.match(GITHUB_URL_PATTERN) ?? []) {
    const candidate = trimUrlPunctuation(match);
    const repo = parseGitHubRepoRef(candidate);
    if (repo === null) {
      continue;
    }

    remainingText = remainingText.replace(candidate, " ");

    if (!repos.some((known) => isSameGitHubRepo(known, repo))) {
      repos.push(repo);
    }
  }

  return { remainingText: tidyWhitespace(remainingText), repos };
}

/**
 * Appends staged repository links to the message the Director receives, one
 * per line. Links already present in the text are not duplicated.
 */
export function appendGitHubRepoRefs(
  text: string,
  repos: readonly GitHubRepoRef[]
): string {
  if (repos.length === 0) {
    return text;
  }

  const body = text.trim();
  const missing = repos
    .filter((repo) => !body.includes(repo.href))
    .map((repo) => repo.href);

  if (missing.length === 0) {
    return text;
  }

  return body.length === 0 ? missing.join("\n") : `${body}\n${missing.join("\n")}`;
}
