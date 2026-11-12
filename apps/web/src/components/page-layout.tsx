import { cn } from "@curio/ui/lib/utils";
import type { ComponentProps, ReactNode } from "react";

/**
 * Shared page frame. Every non-split page (Courses, Settings, fallbacks)
 * uses the same horizontal rhythm so navigation never changes the measure.
 */
export function PageContainer({
  children,
  className,
  width = "default",
  ...props
}: ComponentProps<"div"> & {
  width?: "default" | "narrow";
}) {
  return (
    <div
      className={cn(
        width === "narrow" ? "page-container-narrow" : "page-container",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  actions,
  description,
  eyebrow,
  title,
}: {
  actions?: ReactNode;
  description?: string;
  eyebrow?: string;
  title: string;
}) {
  return (
    <header className="mb-10 flex items-start justify-between gap-6">
      <div className="min-w-0">
        {eyebrow === undefined ? null : (
          <p className="section-label mb-3">{eyebrow}</p>
        )}
        <h1 className="page-title">{title}</h1>
        {description === undefined ? null : (
          <p className="page-description">{description}</p>
        )}
      </div>
      {actions === undefined ? null : (
        <div className="flex shrink-0 items-center gap-2 pt-1">{actions}</div>
      )}
    </header>
  );
}

export function SectionHeader({
  children,
  className,
  note,
}: {
  children: string;
  className?: string;
  note?: string;
}) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1",
        className
      )}
    >
      <h2 className="section-label">{children}</h2>
      {note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
    </div>
  );
}
