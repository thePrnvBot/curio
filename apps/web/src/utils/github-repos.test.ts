import { describe, expect, it } from "vitest";

import {
  appendGitHubRepoRefs,
  extractGitHubRepoRefs,
  parseGitHubRepoRef,
} from "./github-repos";

describe("parseGitHubRepoRef", () => {
  it("parses a repository URL into an owner/repo chip", () => {
    expect(parseGitHubRepoRef("https://github.com/vercel/next.js")).toEqual({
      href: "https://github.com/vercel/next.js",
      owner: "vercel",
      repo: "next.js",
      slug: "vercel/next.js",
    });
  });

  it("accepts www hosts, http and trailing slashes", () => {
    expect(parseGitHubRepoRef("http://www.github.com/curio/app/")?.slug).toBe(
      "curio/app"
    );
  });

  it("accepts a bare github.com link from the address bar", () => {
    expect(parseGitHubRepoRef("github.com/effect-ts/effect")?.href).toBe(
      "https://github.com/effect-ts/effect"
    );
  });

  it("keeps deep links but labels them by repository", () => {
    const repo = parseGitHubRepoRef(
      "https://github.com/tanstack/router/tree/main/packages/react-router"
    );

    expect(repo?.slug).toBe("tanstack/router");
    expect(repo?.href).toBe(
      "https://github.com/tanstack/router/tree/main/packages/react-router"
    );
  });

  it("drops a .git suffix from the label", () => {
    expect(parseGitHubRepoRef("https://github.com/owner/repo.git")).toMatchObject(
      { repo: "repo", slug: "owner/repo" }
    );
  });

  it("rejects non-repository GitHub pages", () => {
    expect(parseGitHubRepoRef("https://github.com/features/actions")).toBeNull();
    expect(parseGitHubRepoRef("https://github.com/settings/appearance")).toBeNull();
    expect(parseGitHubRepoRef("https://github.com/owner")).toBeNull();
  });

  it("rejects other hosts and non-http protocols", () => {
    expect(parseGitHubRepoRef("https://gitlab.com/owner/repo")).toBeNull();
    expect(
      parseGitHubRepoRef("https://notgithub.com/owner/repo")
    ).toBeNull();
    expect(
      parseGitHubRepoRef("ftp://github.com/owner/repo")
    ).toBeNull();
    expect(parseGitHubRepoRef("not a url")).toBeNull();
  });
});

describe("extractGitHubRepoRefs", () => {
  it("removes the link from the pasted text and keeps the prose", () => {
    const { remainingText, repos } = extractGitHubRepoRefs(
      "please read https://github.com/vercel/next.js and explain"
    );

    expect(repos.map((repo) => repo.slug)).toEqual(["vercel/next.js"]);
    expect(remainingText).toBe("please read and explain");
  });

  it("trims sentence punctuation after the link", () => {
    const { remainingText, repos } = extractGitHubRepoRefs(
      "see https://github.com/vercel/next.js."
    );

    expect(repos.map((repo) => repo.href)).toEqual([
      "https://github.com/vercel/next.js",
    ]);
    expect(remainingText).toBe("see .");
  });

  it("deduplicates the same repository", () => {
    const { repos } = extractGitHubRepoRefs(
      "https://github.com/vercel/next.js\nhttps://github.com/Vercel/next.js"
    );

    expect(repos).toHaveLength(1);
  });

  it("leaves non-repository links in the text", () => {
    const text = "https://github.com/features/actions and https://example.com";
    const { remainingText, repos } = extractGitHubRepoRefs(text);

    expect(repos).toHaveLength(0);
    expect(remainingText).toBe(text);
  });

  it("does not treat lookalike hosts as GitHub links", () => {
    const { remainingText, repos } = extractGitHubRepoRefs(
      "https://notgithub.com/owner/repo"
    );

    expect(repos).toHaveLength(0);
    expect(remainingText).toBe("https://notgithub.com/owner/repo");
  });
});

describe("appendGitHubRepoRefs", () => {
  const repo = {
    href: "https://github.com/vercel/next.js",
    owner: "vercel",
    repo: "next.js",
    slug: "vercel/next.js",
  } as const;

  it("appends the staged link on its own line", () => {
    expect(appendGitHubRepoRefs("explain this", [repo])).toBe(
      "explain this\nhttps://github.com/vercel/next.js"
    );
  });

  it("sends the link alone when the chip was the whole message", () => {
    expect(appendGitHubRepoRefs("   ", [repo])).toBe(
      "https://github.com/vercel/next.js"
    );
  });

  it("does not duplicate a link already in the text", () => {
    expect(
      appendGitHubRepoRefs("https://github.com/vercel/next.js", [repo])
    ).toBe("https://github.com/vercel/next.js");
  });

  it("returns the text untouched without staged links", () => {
    expect(appendGitHubRepoRefs("hello", [])).toBe("hello");
  });
});
