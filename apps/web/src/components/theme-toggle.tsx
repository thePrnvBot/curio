import { Button } from "@curio/ui/components/button";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { playInteractionCue } from "@/utils/sound";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";

  return (
    <Button
      aria-label="Toggle theme"
      className="rounded-full hover:-translate-y-0.5"
      onClick={() => {
        playInteractionCue("toggle", { emphasis: "subtle" });
        setTheme(nextTheme);
      }}
      size="icon"
      variant="ghost"
    >
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="dark:hidden" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
