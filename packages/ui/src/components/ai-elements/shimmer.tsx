"use client";

import { cn } from "@curio/ui/lib/utils";
import { memo } from "react";

export interface ShimmerProps {
  children: string;
  as?: "p" | "span" | "h1" | "h2" | "h3" | "h4";
  className?: string;
  /** Seconds for one pulse cycle. */
  duration?: number;
}

const ShimmerComponent = ({
  children,
  as: Tag = "p",
  className,
  duration = 2,
}: ShimmerProps) => (
  <Tag
    className={cn("inline-block animate-pulse text-inherit", className)}
    style={{ animationDuration: `${duration}s` }}
  >
    {children}
  </Tag>
);

export const Shimmer = memo(ShimmerComponent);
