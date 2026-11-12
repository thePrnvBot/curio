"use client";

import { Badge } from "@curio/ui/components/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@curio/ui/components/collapsible";
import { cn } from "@curio/ui/lib/utils";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";

import { CodeBlock } from "./code-block";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn(
      "group not-prose bg-card border-border/80 mb-1 w-full overflow-hidden rounded-lg border",
      className
    )}
    {...props}
  />
);

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type ToolHeaderProps = {
  title?: string;
  className?: string;
} & (
  | { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
  | {
      type: DynamicToolUIPart["type"];
      state: DynamicToolUIPart["state"];
      toolName: string;
    }
);

const statusLabels: Record<ToolPart["state"], string> = {
  "approval-requested": "Awaiting Approval",
  "approval-responded": "Responded",
  "input-available": "Running",
  "input-streaming": "Pending",
  "output-available": "Completed",
  "output-denied": "Denied",
  "output-error": "Error",
};

const statusIcons: Record<ToolPart["state"], ReactNode> = {
  "approval-requested": <ClockIcon className="text-warning size-4" />,
  "approval-responded": <CheckCircleIcon className="text-info size-4" />,
  "input-available": <ClockIcon className="size-4 animate-pulse" />,
  "input-streaming": <CircleIcon className="size-4" />,
  "output-available": <CheckCircleIcon className="text-success size-4" />,
  "output-denied": <XCircleIcon className="text-warning size-4" />,
  "output-error": <XCircleIcon className="text-destructive size-4" />,
};

export const getStatusBadge = (status: ToolPart["state"]) => (
  <Badge className="h-4 gap-1 px-1.5 py-0" variant="secondary">
    {statusIcons[status]}
    {statusLabels[status]}
  </Badge>
);

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  toolName,
  ...props
}: ToolHeaderProps) => {
  const derivedName =
    type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");

  return (
    <CollapsibleTrigger
      className={cn(
        "hover:bg-muted/40 flex w-full items-center justify-between gap-2 px-3 py-2 transition-colors",
        className
      )}
      {...props}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <WrenchIcon className="text-muted-foreground size-3.5 shrink-0" />
        <span className="truncate text-xs font-medium text-foreground">
          {title ?? derivedName}
        </span>
        {getStatusBadge(state)}
      </div>
      <ChevronDownIcon className="text-muted-foreground size-3.5 shrink-0 transition-transform group-data-open:rotate-180" />
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    keepMounted
    className={cn(
      "text-popover-foreground border-border/70 space-y-3 border-t p-3 outline-none",
      className
    )}
    {...props}
  />
);

export type ToolErrorDisplayProps = ComponentProps<"div">;

export const ToolErrorDisplay = ({
  className,
  ...props
}: ToolErrorDisplayProps) => (
  <div
    className={cn(
      "bg-destructive/10 ring-destructive/20 text-destructive p-3 text-xs ring-1",
      className
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("space-y-2 overflow-hidden", className)} {...props}>
    <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
      Parameters
    </h4>
    <div className="bg-muted/50">
      <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
    </div>
  </div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"];
  errorText: ToolPart["errorText"];
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }

  let outputNode = <div>{output as ReactNode}</div>;

  if (typeof output === "object" && !isValidElement(output)) {
    outputNode = (
      <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />
    );
  } else if (typeof output === "string") {
    outputNode = <CodeBlock code={output} language="json" />;
  }

  return (
    <div className={cn("space-y-2", className)} {...props}>
      <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {errorText ? "Error" : "Result"}
      </h4>
      <div
        className={cn(
          "overflow-x-auto text-xs [&_table]:w-full",
          errorText
            ? "bg-destructive/10 ring-destructive/20 text-destructive ring-1"
            : "bg-muted/50 text-foreground"
        )}
      >
        {errorText && <div className="p-4">{errorText}</div>}
        {!errorText && outputNode}
      </div>
    </div>
  );
};
