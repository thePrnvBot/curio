import {
  PromptInputButton,
  usePromptInputController,
} from "@curio/ui/components/ai-elements/prompt-input";
import { Effect, Result } from "effect";
import { FilePlus2Icon } from "lucide-react";
import { useReducer } from "react";
import { toast } from "sonner";

import type { GeneratedArtifactResponseView } from "@/utils/chat-schemas";

import { artifactButtonReducer } from "./chat-artifact-button-state";
import { generateArtifact } from "./chat-artifact-generate";

/**
 * The "Artifact" toolbar action: sends the prompt text as a generation
 * request and, on success, hands the published artifact to the transcript.
 * Failures arrive through the typed error channel and surface as toasts.
 */
export function ArtifactActionButton({
  chatId,
  disabled = false,
  onPublished,
}: {
  chatId: string;
  disabled?: boolean;
  onPublished: (publishedArtifact: GeneratedArtifactResponseView) => void;
}) {
  const promptInput = usePromptInputController();
  const [state, dispatch] = useReducer(artifactButtonReducer, {
    kind: "idle",
  });
  const isGenerating = state.kind === "generating";

  async function publishArtifactFromPrompt(): Promise<void> {
    if (isGenerating) {
      return;
    }
    const promptText = promptInput.textInput.value.trim();
    if (promptText === "") {
      toast.error("Describe the artifact in the input first");
      return;
    }

    dispatch({ type: "start" });
    const publishOutcome = await Effect.runPromise(
      Effect.result(generateArtifact(chatId, promptText))
    );

    Result.match(publishOutcome, {
      onFailure: (generationError) => {
        dispatch({ type: "error", message: generationError.detail });
        toast.error(generationError.detail);
      },
      onSuccess: (publishedArtifact) => {
        dispatch({ type: "published", artifact: publishedArtifact });
        onPublished(publishedArtifact);
        promptInput.textInput.clear();
        toast.success(`Artifact "${publishedArtifact.brief.title}" published`);
      },
    });
  }

  return (
    <PromptInputButton
      aria-busy={isGenerating}
      disabled={disabled || isGenerating}
      onClick={() => {
        void publishArtifactFromPrompt();
      }}
      variant={isGenerating ? "default" : "ghost"}
    >
      <FilePlus2Icon className="size-4" />
      <span>{isGenerating ? "Publishing…" : "Artifact"}</span>
    </PromptInputButton>
  );
}
