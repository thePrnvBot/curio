import {
  PromptInputHeader,
  PromptInputTextarea,
  usePromptInputController,
} from "@curio/ui/components/ai-elements/prompt-input";
import type { PromptInputTextareaProps } from "@curio/ui/components/ai-elements/prompt-input";
import { useCallback } from "react";
import type { ClipboardEvent } from "react";

import { GitHubRepoChip } from "@/components/chat/github-repo-chip";
import { extractGitHubRepoRefs } from "@/utils/github-repos";
import type { GitHubRepoRef } from "@/utils/github-repos";

/**
 * Staged GitHub repositories above the prompt textarea. Like attachment
 * chips, the strip only mounts when a repository was pasted so the composer
 * doesn't grow a phantom padded row.
 */
export function PromptInputReposDisplay({
  onRemove,
  repos,
}: {
  readonly onRemove: (repo: GitHubRepoRef) => void;
  readonly repos: readonly GitHubRepoRef[];
}) {
  if (repos.length === 0) {
    return null;
  }

  return (
    <PromptInputHeader>
      <div className="flex flex-wrap items-center gap-1.5 px-2 pt-1">
        {repos.map((repo) => (
          <GitHubRepoChip key={repo.slug} onRemove={onRemove} repo={repo} />
        ))}
      </div>
    </PromptInputHeader>
  );
}

/**
 * Composer textarea that turns pasted GitHub repository links into staged
 * chips instead of raw URLs. Prose pasted alongside the link stays in the
 * textarea; the staged link is appended to the message on submit.
 */
export function PromptInputTextareaWithGitHubRepos({
  onStageRepos,
  ...props
}: PromptInputTextareaProps & {
  readonly onStageRepos: (repos: readonly GitHubRepoRef[]) => void;
}) {
  const controller = usePromptInputController();

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const pastedText = event.clipboardData.getData("text");
      if (pastedText.trim().length === 0) {
        return;
      }

      const { remainingText, repos } = extractGitHubRepoRefs(pastedText);
      if (repos.length === 0) {
        return;
      }

      event.preventDefault();
      onStageRepos(repos);

      if (remainingText.length === 0) {
        return;
      }

      const textarea = event.currentTarget;
      const { selectionEnd, selectionStart, value } = textarea;
      const nextValue = `${value.slice(0, selectionStart)}${remainingText}${value.slice(selectionEnd)}`;
      controller.textInput.setInput(nextValue);

      // The provider owns the textarea value, so the caret can only be
      // restored after React commits the new controlled value.
      const caret = selectionStart + remainingText.length;
      requestAnimationFrame(() => {
        textarea.setSelectionRange(caret, caret);
      });
    },
    [controller, onStageRepos]
  );

  return <PromptInputTextarea onPaste={handlePaste} {...props} />;
}
