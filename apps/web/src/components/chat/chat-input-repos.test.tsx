import {
  PromptInput,
  PromptInputProvider,
} from "@curio/ui/components/ai-elements/prompt-input";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  PromptInputReposDisplay,
  PromptInputTextareaWithGitHubRepos,
} from "./chat-input-repos";
import type { GitHubRepoRef } from "@/utils/github-repos";

function renderComposer(onStageRepos: () => void) {
  render(
    <PromptInputProvider>
      <PromptInput onSubmit={vi.fn()}>
        <PromptInputTextareaWithGitHubRepos
          onStageRepos={onStageRepos}
          placeholder="Ask Curio anything..."
        />
      </PromptInput>
    </PromptInputProvider>
  );

  return screen.getByRole("textbox", { name: "Message" });
}

function paste(textarea: HTMLElement, text: string): void {
  fireEvent.paste(textarea, {
    clipboardData: {
      getData: () => text,
      items: [],
    },
  });
}

describe("PromptInputTextareaWithGitHubRepos", () => {
  it("stages a pasted GitHub link instead of inserting the raw URL", () => {
    const onStageRepos = vi.fn();
    const textarea = renderComposer(onStageRepos);

    paste(textarea, "https://github.com/vercel/next.js");

    expect(onStageRepos).toHaveBeenCalledWith([
      expect.objectContaining({ slug: "vercel/next.js" }),
    ]);
    expect(textarea).toHaveValue("");
  });

  it("keeps the prose around a pasted link", () => {
    const onStageRepos = vi.fn();
    const textarea = renderComposer(onStageRepos);

    paste(textarea, "explain https://github.com/vercel/next.js please");

    expect(onStageRepos).toHaveBeenCalledWith([
      expect.objectContaining({ slug: "vercel/next.js" }),
    ]);
    expect(textarea).toHaveValue("explain please");
  });

  it("leaves non-GitHub pastes untouched", () => {
    const onStageRepos = vi.fn();
    const textarea = renderComposer(onStageRepos);

    paste(textarea, "https://example.com/docs");

    expect(onStageRepos).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("");
  });
});

describe("PromptInputReposDisplay", () => {
  const repo: GitHubRepoRef = {
    href: "https://github.com/vercel/next.js",
    owner: "vercel",
    repo: "next.js",
    slug: "vercel/next.js",
  };

  it("renders a chip per staged repository and removes it", () => {
    const onRemove = vi.fn();
    render(<PromptInputReposDisplay onRemove={onRemove} repos={[repo]} />);

    expect(screen.getByText("vercel/next.js")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Remove vercel/next.js" })
    );

    expect(onRemove).toHaveBeenCalledWith(repo);
  });

  it("renders nothing without staged repositories", () => {
    const { container } = render(
      <PromptInputReposDisplay onRemove={vi.fn()} repos={[]} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
