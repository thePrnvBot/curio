"use client";

import { CodeBlock } from "@curio/ui/components/ai-elements/code-block";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
} from "@curio/ui/components/ai-elements/tool";
import type { ToolUIPart } from "ai";
import { ExternalLinkIcon, GlobeIcon, SearchIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Collapsible cards for the Director's web tool calls. They render whatever
 * the stream has committed so far, so a search or page read shows as running
 * while the agent is away and completes on its own when the durable run
 * streams back in.
 */

const WEB_MAX_RESULTS_SHOWN = 8;
const WEB_READ_MARKDOWN_PREVIEW_CHARS = 6000;

const WEB_TOOL_LABELS: Record<string, string> = {
  web_read: "Read page",
  web_search: "Web search",
};

interface WebSearchToolOutput {
  blocked?: boolean;
  error?: string;
  note?: string;
  results?: readonly {
    snippet: string;
    title: string;
    url: string;
  }[];
}

interface WebReadToolOutput {
  error?: string;
  markdown?: string;
  note?: string;
  truncated?: boolean;
  url?: string;
}

function toWebSearchOutput({ output }: ToolUIPart): WebSearchToolOutput | null {
  if (typeof output !== "object" || output === null) {
    return null;
  }
  const candidate = output as WebSearchToolOutput;
  const isSearchShape =
    typeof candidate.blocked === "boolean" ||
    Array.isArray(candidate.results) ||
    (typeof candidate.error === "string" && !("markdown" in candidate));
  return isSearchShape ? candidate : null;
}

function toWebReadOutput({ output }: ToolUIPart): WebReadToolOutput | null {
  if (typeof output !== "object" || output === null) {
    return null;
  }
  const candidate = output as WebReadToolOutput;
  const isReadShape =
    typeof candidate.markdown === "string" ||
    typeof candidate.url === "string";
  return isReadShape ? candidate : null;
}

function WebSearchResults({ output }: { output: WebSearchToolOutput }) {
  if (output.blocked === true) {
    return (
      <p className="text-muted-foreground text-xs">
        {output.note ?? "DuckDuckGo temporarily blocked the search."}
      </p>
    );
  }
  const results = output.results ?? [];
  if (results.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        {output.error ?? "No results."}
      </p>
    );
  }
  return (
    <ul className="divide-border divide-y overflow-hidden rounded-md border border-border bg-muted/30">
      {results
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
              <span className="truncate">{result.title || result.url}</span>
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

function WebReadContent({ output }: { output: WebReadToolOutput }) {
  if (typeof output.error === "string") {
    return <p className="text-destructive text-xs">{output.error}</p>;
  }
  const markdown = output.markdown ?? "";
  if (markdown === "") {
    return null;
  }
  const preview =
    markdown.length > WEB_READ_MARKDOWN_PREVIEW_CHARS
      ? `${markdown.slice(0, WEB_READ_MARKDOWN_PREVIEW_CHARS)}…`
      : markdown;
  return (
    <div className="space-y-2">
      <CodeBlock code={preview} language="markdown" />
      {output.note && (
        <p className="text-muted-foreground text-xs">{output.note}</p>
      )}
    </div>
  );
}

function webToolContent(part: ToolUIPart, toolName: string): ReactNode {
  const committedOutput = part.output;
  let body: ReactNode = null;

  if (!toolName.startsWith("web_")) {
    return null;
  }

  if (toolName === "web_search") {
    const output = toWebSearchOutput(part);
    if (output !== null) {
      body = <WebSearchResults output={output} />;
    }
  }
  if (toolName === "web_read") {
    const output = toWebReadOutput(part);
    if (output !== null) {
      body = <WebReadContent output={output} />;
    }
  }
  if (committedOutput === undefined && body === null) {
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
      <div className="min-w-0 flex-1">{body}</div>
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
