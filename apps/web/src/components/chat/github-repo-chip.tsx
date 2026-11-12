import { IconBrandGithub } from "@tabler/icons-react";
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";

import { parseGitHubRepoRef } from "@/utils/github-repos";
import type { GitHubRepoRef } from "@/utils/github-repos";

const CHIP_CLASS_NAME =
  "border-border/80 bg-background/70 text-foreground hover:bg-background inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 align-middle text-[13px] leading-5 font-medium no-underline transition-colors";

/**
 * Compact representation of a GitHub repository: the GitHub mark plus the
 * `owner/repo` slug. Rendered as a link in the transcript and as a removable
 * chip above the composer.
 */
export function GitHubRepoChip({
  onRemove,
  repo,
}: {
  readonly onRemove?: (repo: GitHubRepoRef) => void;
  readonly repo: GitHubRepoRef;
}) {
  const content: ReactNode = (
    <>
      <IconBrandGithub aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">{repo.slug}</span>
    </>
  );

  if (onRemove !== undefined) {
    return (
      <span
        className={CHIP_CLASS_NAME}
        data-github-repo={repo.slug}
        title={repo.href}
      >
        {content}
        <button
          aria-label={`Remove ${repo.slug}`}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -mr-0.5 rounded-sm p-0.5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
          onClick={() => {
            onRemove(repo);
          }}
          type="button"
        >
          <XIcon className="size-3" />
        </button>
      </span>
    );
  }

  return (
    <a
      className={CHIP_CLASS_NAME}
      data-github-repo={repo.slug}
      href={repo.href}
      rel="noreferrer noopener"
      target="_blank"
      title={repo.href}
    >
      {content}
    </a>
  );
}

/**
 * Markdown anchor renderer for user messages: GitHub repository links become
 * chips, everything else stays a normal link.
 */
export function GitHubRepoLink({
  children,
  href,
}: {
  readonly children?: ReactNode;
  readonly href?: string;
}) {
  const repo = typeof href === "string" ? parseGitHubRepoRef(href) : null;

  if (repo === null) {
    return (
      <a href={href} rel="noreferrer noopener" target="_blank">
        {children}
      </a>
    );
  }

  return <GitHubRepoChip repo={repo} />;
}
