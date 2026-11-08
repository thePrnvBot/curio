import { Loader2 } from "lucide-react";

export default function Loader() {
  return (
    <output
      aria-live="polite"
      className="flex h-full items-center justify-center pt-8"
    >
      <Loader2 aria-hidden="true" className="size-5 animate-spin" />
      <span className="sr-only">Loading…</span>
    </output>
  );
}
