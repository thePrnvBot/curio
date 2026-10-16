import { useEffect, useState } from "react";

/**
 * Course progress bar that always animates from zero to its value on mount
 * (instead of painting the destination width immediately or sliding down
 * from full when a remount lands), and keeps gliding on later updates.
 */
export function ProgressFromZero({
  percent,
  className,
}: {
  /** 0-100 target value; the bar animates up to it. */
  percent: number;
  /** Track classes; include height/rounding/background. */
  className: string;
}): React.ReactElement {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    // One frame after hydration so the zero-width paint lands first and the
    // transition actually animates the fill upward.
    const frame = requestAnimationFrame(() => setHasMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));
  const renderedPercent = hasMounted ? Math.max(clampedPercent, 2) : 0;

  return (
    <div className={`overflow-hidden ${className}`}>
      <div
        className="bg-primary h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${renderedPercent}%` }}
      />
    </div>
  );
}
