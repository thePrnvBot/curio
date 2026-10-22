import type { BundledLanguage } from "@curio/ui/components/ai-elements/code-block";
import { CodeBlock } from "@curio/ui/components/ai-elements/code-block";
import { MessageResponse } from "@curio/ui/components/ai-elements/message";
import { Option } from "effect";

import { toArtifactRenderPlan } from "@/utils/chat-schemas";
import type { ArtifactUIData } from "@/utils/ui-messages";

import { ArtifactHtmlFrame } from "./chat-artifact-frame";

/**
 * Renders one artifact's content according to its media type. The media type
 * is untrusted stream/tool data, so `toArtifactRenderPlan` decodes it into a
 * discriminated plan and this component dispatches exhaustively on `kind` —
 * no media-type string checks live here.
 */

// `text` is shiki's runtime-only no-highlight fallback (code-block.tsx itself
// degrades to it when a language cannot load); the type union omits it, so
// the alias crosses the boundary with exactly one documented cast.
const UNHIGHLIGHTED_LANGUAGE = "text" as BundledLanguage;

export function ArtifactPreviewer({ data }: { data: ArtifactUIData }) {
  const renderPlan = toArtifactRenderPlan(data.mediaType);

  switch (renderPlan.kind) {
    case "embed": {
      return (
        <ArtifactHtmlFrame htmlContent={data.content} title={data.title} />
      );
    }
    case "svg": {
      return (
        <img
          alt={Option.getOrElse(data.title, () => "Artifact preview")}
          className="max-h-[420px] w-full rounded-md"
          src={`data:image/svg+xml;utf8,${encodeURIComponent(data.content)}`}
        />
      );
    }
    case "markdown": {
      return (
        <div className="text-sm">
          <MessageResponse>{data.content}</MessageResponse>
        </div>
      );
    }
    case "code": {
      return <CodeBlock code={data.content} language={renderPlan.language} />;
    }
    // The plan decoder guarantees `plain` for every media type it does not
    // recognize, so the default arm is the documented plain-text rendering.
    default: {
      return (
        <CodeBlock code={data.content} language={UNHIGHLIGHTED_LANGUAGE} />
      );
    }
  }
}
