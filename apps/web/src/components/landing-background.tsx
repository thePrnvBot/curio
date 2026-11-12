/**
 * Static landing backdrop: a faint Vercel-style grid with one soft brand wash.
 * No canvas, no animation loop, no extra chunk - it paints once and stays put.
 */
export function LandingBackground({
  variant = "hero",
}: {
  variant?: "hero" | "cta";
}) {
  const isCta = variant === "cta";
  const mask = isCta
    ? "radial-gradient(ellipse at 50% 92%, black 8%, transparent 72%)"
    : "radial-gradient(ellipse at 50% 32%, black 12%, transparent 72%)";

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in oklab, var(--border) 62%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--border) 62%, transparent) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: mask,
          WebkitMaskImage: mask,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: isCta
            ? "radial-gradient(ellipse 68% 58% at 50% 100%, color-mix(in oklab, var(--brand) 14%, transparent), transparent 72%)"
            : "radial-gradient(ellipse 68% 52% at 50% 0%, color-mix(in oklab, var(--brand) 11%, transparent), transparent 70%)",
        }}
      />
    </div>
  );
}
