import { BookOpenIcon } from "lucide-react";

/**
 * Placeholder cover art for a course. Curio does not generate course imagery,
 * so the cover is an intentional quiet surface: a soft warm field, a faint
 * dot grid, and the course glyph. The real content details sit over the
 * bottom fade of the card.
 */
export function CourseCardArt({ active = false }: { active?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="bg-muted absolute inset-0 overflow-hidden"
    >
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle, color-mix(in oklab, var(--muted-foreground) 45%, transparent) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: active
            ? "radial-gradient(ellipse at 24% 8%, color-mix(in oklab, var(--brand) 22%, transparent), transparent 58%)"
            : "radial-gradient(ellipse at 24% 8%, color-mix(in oklab, var(--foreground) 8%, transparent), transparent 58%)",
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center pb-16">
        <span
          className={
            active
              ? "border-brand/20 bg-brand/10 text-brand flex size-11 items-center justify-center rounded-xl border"
              : "border-border bg-background/70 text-muted-foreground flex size-11 items-center justify-center rounded-xl border"
          }
        >
          <BookOpenIcon className="size-5" />
        </span>
      </div>
    </div>
  );
}
