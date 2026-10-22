import {
  Tool,
  ToolContent,
  ToolErrorDisplay,
  ToolHeader,
  ToolInput,
} from "@curio/ui/components/ai-elements/tool";
import type { ToolUIPart } from "ai";
import { Option } from "effect";

import { toArtifactData } from "@/utils/chat-schemas";
import type { ArtifactUIData } from "@/utils/ui-messages";

import { ArtifactPreviewer } from "./chat-artifact-preview";

/**
 * Collapsible card for the Director's artifact-generation tool call. While
 * the tool runs (or errors) the card shows the call's input; once it
 * commits, `part.input` decodes into the published artifact's preview.
 * `hideArtifact` lets the transcript suppress the in-card preview when the
 * same artifact is already rendered as a separate inline card.
 */
export function ArtifactToolView({
  hideArtifact,
  part,
}: {
  hideArtifact: boolean;
  part: ToolUIPart;
}) {
  const inlineArtifactData: Option.Option<ArtifactUIData> = hideArtifact
    ? Option.none()
    : toArtifactData(part.input);

  return (
    <Tool defaultOpen={part.state !== "output-available"}>
      <ToolHeader state={part.state} type={part.type} />
      <ToolContent>
        {part.input !== undefined && <ToolInput input={part.input} />}
        {part.state === "output-error" && (
          <ToolErrorDisplay>{part.errorText}</ToolErrorDisplay>
        )}
        {part.state === "output-available" &&
          Option.isSome(inlineArtifactData) && (
            <ArtifactPreviewer data={inlineArtifactData.value} />
          )}
      </ToolContent>
    </Tool>
  );
}
