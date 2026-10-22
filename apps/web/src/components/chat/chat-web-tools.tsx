import { CodeBlock } from "@curio/ui/components/ai-elements/code-block";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
} from "@curio/ui/components/ai-elements/tool";
import type { ToolUIPart } from "ai";
import { Option } from "effect";
import { ExternalLinkIcon, GlobeIcon, SearchIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  toWebReadToolOutput,
  toWebSearchToolOutput,
} from "@/utils/chat-schemas";
import type {
  WebReadToolOutputView,
  WebSearchToolOutputView,
} from "@/utils/chat-schemas";

/**
 * Collapsible cards for the Director's web tool calls. They render whatever
 * the stream has committed so far, so a search or page read shows as running
 * while the agent is away and completes on its own when the durable run
 * streams back in. The tool name picks the decoder for the committed output;
 * a malformed payload degrades to an empty card body instead of crashing.
 */

const WEB_MAX_RESULTS_SHOWN = 8;
const WEB_READ_MARKDOWN_PREVIEW_CHARS = 6000;

const WEB_TOOL_LABELS: Record<string, string> = {
  web_read: "Read page",
  web_search: "Web search",
};

function WebSearchResults({
  output,
}: {
  output: WebSearchToolOutputView;
}): ReactNode {
  if (output.blocked) {
    return (
      <p className="text-muted-foreground text-xs">
        {Option.getOrElse(
          output.note,
          () => "DuckDuckGo temporarily blocked the search."
        )}
      </p>
    );
  }
  if (output.results.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        {Option.getOrElse(output.error, () => "No results.")}
      </p>
    );
  }
  return (
    <ul className="divide-border border-border bg-muted/30 divide-y overflow-hidden rounded-md border">
      {output.results
        .slice(0, WEB_MAX_RESULTS_SHOWN)
        .map((result, resultIndex) => (
          <li
            className="min-w-0 space-y-0.5 p-2.5"
            key={`${result.url}-${resultIndex}`}
          >
            <a
              className="text-foreground flex items-center gap-1.5 text-xs font-medium hover:underline"
              href={result.url}
              rel="noreferrer noopener"
              target="_blank"
            >
              <span className="truncate">
                {result.title.length > 0 ? result.title : result.url}
              </span>
              <ExternalLinkIcon className="text-muted-foreground size-3 shrink-0" />
            </a>
            {result.snippet.length > 0 && (
              <p className="text-muted-foreground line-clamp-3 text-xs">
                {result.snippet}
              </p>
            )}
          </li>
        ))}
    </ul>
  );
}

function WebReadContent({
  output,
}: {
  output: WebReadToolOutputView;
}): ReactNode {
  if (Option.isSome(output.error)) {
    return <p className="text-destructive text-xs">{output.error.value}</p>;
  }
  if (output.markdown === "") {
    return null;
  }
  const markdownPreview =
    output.markdown.length > WEB_READ_MARKDOWN_PREVIEW_CHARS
      ? `${output.markdown.slice(0, WEB_READ_MARKDOWN_PREVIEW_CHARS)}…`
      : output.markdown;
  return (
    <div className="space-y-2">
      <CodeBlock code={markdownPreview} language="markdown" />
      {Option.isSome(output.note) && (
        <p className="text-muted-foreground text-xs">{output.note.value}</p>
      )}
    </div>
  );
}

/** The committed output decodes per tool; anything else has no body. */
function webToolBody(
  toolName: string,
  committedOutput: unknown
): Option.Option<ReactNode> {
  if (toolName === "web_search") {
    return Option.map(toWebSearchToolOutput(committedOutput), (output) => (
      <WebSearchResults output={output} />
    ));
  }
  if (toolName === "web_read") {
    return Option.map(toWebReadToolOutput(committedOutput), (output) => (
      <WebReadContent output={output} />
    ));
  }
  return Option.none();
}

function webToolContent(part: ToolUIPart, toolName: string): ReactNode {
  if (!toolName.startsWith("web_")) {
    return null;
  }
  // Without a committed output the card is pure "running" chrome; once one
  // arrives, the card stays (possibly empty if the payload fails decode).
  const body = webToolBody(toolName, part.output);
  if (Option.isNone(body) && part.output === undefined) {
    return null;
  }

  return (
    <div className="flex items-start gap-2">
      {toolName === "web_read" && (
        <GlobeIcon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
      )}
      {toolName === "web_search" && (
        <SearchIcon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
      )}
      <div className="min-w-0 flex-1">{Option.getOrElse(body, () => null)}</div>
    </div>
  );
}

export function WebToolView({ part }: { part: ToolUIPart }) {
  const { errorText, input, state, toolCallId, type } = part;
  // isToolUIPart guarantees type === `tool-${string}`.
  const toolName = type.slice("tool-".length);
  const label = WEB_TOOL_LABELS[toolName] ?? toolName;
  const hasError = typeof errorText === "string" && errorText.length > 0;

  return (
    <Tool key={toolCallId}>
      <ToolHeader state={state} title={label} type={type} />
      <ToolContent>
        <ToolInput input={input} />
        {hasError && (
          <p className="bg-destructive/10 text-destructive ring-destructive/20 rounded-md p-3 text-xs ring-1">
            {errorText}
          </p>
        )}
        {!hasError && webToolContent(part, toolName)}
      </ToolContent>
    </Tool>
  );
}
