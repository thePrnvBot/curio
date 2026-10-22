import {
  PromptInputButton,
  usePromptInputController,
} from "@curio/ui/components/ai-elements/prompt-input";
import { Effect, Result } from "effect";
import { FilePlus2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { GeneratedArtifactResponseView } from "@/utils/chat-schemas";

import { generateArtifact } from "./chat-artifact-generate";

/**
 * The "Artifact" toolbar action: sends the prompt text as a generation
 * request and, on success, hands the published artifact to the transcript.
 * Failures arrive through the typed error channel and surface as toasts.
 */
export function ArtifactActionButton({
  onPublished,
}: {
  onPublished: (publishedArtifact: GeneratedArtifactResponseView) => void;
}) {
  const promptInput = usePromptInputController();
  const [isGenerating, setIsGenerating] = useState(false);

  async function publishArtifactFromPrompt(): Promise<void> {
    const promptText = promptInput.textInput.value.trim();
    if (promptText === "") {
      toast.error("Describe the artifact in the input first");
      return;
    }

    setIsGenerating(true);
    const publishOutcome = await Effect.runPromise(
      Effect.result(generateArtifact(promptText))
    );
    setIsGenerating(false);

    Result.match(publishOutcome, {
      onFailure: (generationError) => {
        toast.error(generationError.detail);
      },
      onSuccess: (publishedArtifact) => {
        onPublished(publishedArtifact);
        promptInput.textInput.clear();
        toast.success(`Artifact "${publishedArtifact.brief.title}" published`);
      },
    });
  }

  return (
    <PromptInputButton
      onClick={() => {
        void publishArtifactFromPrompt();
      }}
      variant={isGenerating ? "default" : "ghost"}
    >
      <FilePlus2Icon className="size-4" />
      <span>Artifact</span>
    </PromptInputButton>
  );
}
