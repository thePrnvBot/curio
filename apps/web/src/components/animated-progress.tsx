import { useEffect, useState } from "react";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Course progress bar that always animates from zero to its value on mount
 * (instead of painting the destination width immediately or sliding down
 * from full when a remount lands), and keeps gliding on later updates.
 * Respects `prefers-reduced-motion`.
 */
export function ProgressFromZero({
  className,
  label = "Progress",
  percent,
}: {
  /** 0-100 target value; the bar animates up to it. */
  percent: number;
  /** Track classes; include height/rounding/background. */
  className: string;
  /** Accessible name announced with the numeric value. */
  label?: string;
}): React.ReactElement {
  const [hasMounted, setHasMounted] = useState(prefersReducedMotion());

  useEffect(() => {
    if (prefersReducedMotion()) {
      return;
    }
    // One frame after hydration so the zero-width paint lands first and the
    // transition actually animates the fill upward.
    const frame = requestAnimationFrame(() => setHasMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));
  // The semantic value must stay honest (0% announces 0%); the 2px visual
  // minimum is CSS-only.
  const renderedPercent = hasMounted ? clampedPercent : 0;

  return (
    <progress
      aria-label={label}
      className={`bg-muted [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary overflow-hidden rounded-full [&::-moz-progress-bar]:min-w-0.5 [&::-moz-progress-bar]:rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-value]:min-w-0.5 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:transition-[width] [&::-webkit-progress-value]:duration-700 [&::-webkit-progress-value]:ease-out ${className}`}
      max={100}
      value={renderedPercent}
    />
  );
}
