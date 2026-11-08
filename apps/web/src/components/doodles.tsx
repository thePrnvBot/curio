/**
 * Hand-drawn decorative SVGs for the landing page.
 *
 * Every doodle uses `currentColor` for strokes/fills, so they can be tinted
 * with text color utilities (e.g. `text-teal-600/30 dark:text-teal-200/25`)
 * and stay legible in both light and dark themes.
 */
import type { SVGProps } from "react";
import { useId } from "react";

type DoodleProps = SVGProps<SVGSVGElement>;

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** Four-point twinkle star (filled). */
export function Sparkle(props: DoodleProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  );
}

/** Wavy marker underline. */
export function Squiggle(props: DoodleProps) {
  return (
    <svg
      viewBox="0 0 98 16"
      preserveAspectRatio="none"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M2 9 Q 14 3 26 9 T 50 9 T 74 9 T 96 9"
        {...stroke}
        strokeWidth={4}
      />
    </svg>
  );
}

/** Atom with two orbits and an electron. Orbits spin nicely as a whole. */
export function DoodleAtom(props: DoodleProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" {...props}>
      <ellipse cx="24" cy="24" rx="16" ry="6.5" {...stroke} strokeWidth={2} />
      <ellipse
        cx="24"
        cy="24"
        rx="16"
        ry="6.5"
        transform="rotate(65 24 24)"
        {...stroke}
        strokeWidth={2}
      />
      <circle cx="24" cy="24" r="2.6" fill="currentColor" />
      <circle cx="8" cy="24" r="2" fill="currentColor" />
    </svg>
  );
}

/** Globe with a meridian and equator, slightly tilted like a quick sketch. */
export function DoodleGlobe(props: DoodleProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" {...props}>
      <g transform="rotate(-8 24 24)" {...stroke} strokeWidth={2}>
        <circle cx="24" cy="24" r="16" />
        <ellipse cx="24" cy="24" rx="7" ry="16" />
        <path d="M8 24h32" />
      </g>
    </svg>
  );
}

/** Lightbulb with a filament. */
export function DoodleBulb(props: DoodleProps) {
  return (
    <svg viewBox="0 0 40 48" aria-hidden="true" {...props}>
      <g {...stroke} strokeWidth={2.2}>
        <path d="M20 4a12 12 0 0 1 12 12c0 4.5-2.5 7.2-4 9.7-.9 1.4-1.3 2.4-1.5 3.8h-13c-.2-1.4-.6-2.4-1.5-3.8C10.5 23.2 8 20.5 8 16A12 12 0 0 1 20 4z" />
        <path d="M14.5 34h11" />
        <path d="M15.5 38.5h9" />
        <path d="M16.5 16l3.5 3.5 3.5-3.5" />
      </g>
    </svg>
  );
}

/** Open book with a spine. */
export function DoodleBook(props: DoodleProps) {
  return (
    <svg viewBox="0 0 48 40" aria-hidden="true" {...props}>
      <g {...stroke} strokeWidth={2.2}>
        <path d="M24 8c-4-3-10-4.2-16-3.2v28c6-1 12 0 16 3 4-3 10-4.2 16-3.2v-28C34 3.8 28 5 24 8z" />
        <path d="M24 8v28" />
      </g>
    </svg>
  );
}

/** Small plus mark for scattering around compositions. */
export function PlusMark(props: DoodleProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M12 5v14M5 12h14" {...stroke} strokeWidth={2.5} />
    </svg>
  );
}

/**
 * Repeating dot grid that fills its parent. `useId` keeps pattern IDs unique
 * when several DotFields render on the same page.
 */
export function DotField({ className }: { className?: string }) {
  const patternId = `dot-grid-${useId().replaceAll(":", "")}`;
  return (
    <svg className={className} width="100%" height="100%" aria-hidden="true">
      <defs>
        <pattern
          id={patternId}
          width="22"
          height="22"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1.5" cy="1.5" r="1.5" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
