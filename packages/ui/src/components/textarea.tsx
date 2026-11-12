import { cn } from "cn";
import * as React from "react";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input bg-background placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/25 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-white/[0.03] dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 flex field-sizing-content min-h-20 w-full resize-none rounded-md border px-3 py-2 text-[13px] leading-relaxed transition-[border-color,box-shadow] duration-150 ease-out outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
