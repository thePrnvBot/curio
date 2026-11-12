import { cn } from "cn";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "bg-muted motion-safe:animate-pulse rounded-lg [animation-duration:1.8s]",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
