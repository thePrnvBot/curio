"use client";

import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import type { ReactElement } from "react";

import { cn } from "cn";

export function AlertDialog(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Root>
): ReactElement {
  return (
    <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
  );
}

export function AlertDialogTrigger(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>
): ReactElement {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  );
}

export function AlertDialogContent(props: {
  children: React.ReactNode;
  className?: string;
}): ReactElement {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Backdrop
        className="fixed inset-0 z-50 bg-black/60 transition-opacity"
        data-slot="alert-dialog-overlay"
      />
      <AlertDialogPrimitive.Popup
        className={cn(
          "bg-background fixed top-1/2 left-1/2 z-50 grid w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border p-6 shadow-lg",
          props.className
        )}
        data-slot="alert-dialog-content"
      >
        {props.children}
      </AlertDialogPrimitive.Popup>
    </AlertDialogPrimitive.Portal>
  );
}

export function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">): ReactElement {
  return (
    <div
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      data-slot="alert-dialog-header"
      {...props}
    />
  );
}

export function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">): ReactElement {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      data-slot="alert-dialog-footer"
      {...props}
    />
  );
}

export function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>): ReactElement {
  return (
    <AlertDialogPrimitive.Title
      className={cn("text-lg font-semibold", className)}
      data-slot="alert-dialog-title"
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>): ReactElement {
  return (
    <AlertDialogPrimitive.Description
      className={cn("text-muted-foreground text-sm", className)}
      data-slot="alert-dialog-description"
      {...props}
    />
  );
}

export function AlertDialogAction({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Close>): ReactElement {
  return (
    <AlertDialogPrimitive.Close
      className={cn(
        "focus-visible:ring-ring/30 bg-destructive/10 hover:bg-destructive/20 focus-visible:ring-destructive/20 inline-flex h-9 items-center justify-center gap-2 rounded-md border border-transparent px-4 text-sm font-medium text-destructive transition-colors outline-none focus-visible:border-destructive/40 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      data-slot="alert-dialog-action"
      {...props}
    />
  );
}

export function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Close>): ReactElement {
  return (
    <AlertDialogPrimitive.Close
      className={cn(
        "focus-visible:ring-ring/30 border-input hover:bg-accent hover:text-accent-foreground inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      data-slot="alert-dialog-cancel"
      {...props}
    />
  );
}
