import { usePromptInputController } from "@curio/ui/components/ai-elements/prompt-input";
import { useEffect, useRef } from "react";

import { readComposerDraft, writeComposerDraft } from "@/utils/chat-drafts";

/** Delay before a keystroke reaches localStorage; typing stays synchronous. */
const DRAFT_SAVE_DELAY_MS = 250;

/**
 * Keeps the composer text in localStorage, keyed per conversation. Renders
 * nothing and sits inside the PromptInputProvider so it can read and restore
 * the same state the textarea renders from.
 */
export function ChatDraftSync({ draftKey }: { draftKey: string }): null {
  const { textInput } = usePromptInputController();
  const restoredKeyRef = useRef<string | null>(null);

  // Restore once per conversation, after mount so server and client markup
  // agree on an empty composer for the hydration pass.
  useEffect(() => {
    if (restoredKeyRef.current === draftKey) {
      return;
    }
    restoredKeyRef.current = draftKey;
    const saved = readComposerDraft(draftKey);
    if (saved === "") {
      return;
    }
    const frame = requestAnimationFrame(() => {
      textInput.setInput(saved);
    });
    return () => cancelAnimationFrame(frame);
  }, [draftKey, textInput]);

  // Persist the draft while typing. Empty text removes the entry, so sending
  // a message (which clears the composer) also clears its stored draft.
  useEffect(() => {
    if (restoredKeyRef.current !== draftKey) {
      return;
    }
    const timer = window.setTimeout(() => {
      writeComposerDraft(draftKey, textInput.value);
    }, DRAFT_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draftKey, textInput.value]);

  return null;
}
