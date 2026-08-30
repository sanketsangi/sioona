import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type BubbleVariant = "muted" | "default";

/**
 * Local Bubble primitive (geistcn / shadcn-style API).
 * Customer = muted; Agent = default (panel-quiet).
 * Radius / color SoT: `.chat-bubble*` in `globals.css` (`--radius-panel`, `sio-*`).
 */
export function Bubble({
  children,
  variant = "default",
  className = "",
}: {
  children: ReactNode;
  variant?: BubbleVariant;
  className?: string;
}) {
  return (
    <div
      data-variant={variant}
      className={cn("flex w-fit max-w-full flex-col gap-1", className)}
    >
      {children}
    </div>
  );
}

export function BubbleContent({
  children,
  variant = "default",
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: BubbleVariant }) {
  return (
    <div
      data-variant={variant}
      className={cn(
        "chat-bubble",
        variant === "muted" ? "chat-bubble--muted" : "chat-bubble--default",
        className,
      )}
      {...props}
    >
      <p className="min-w-0 break-words text-pretty">{children}</p>
    </div>
  );
}

export function BubbleGroup({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("chat-bubble-group", className)}>{children}</div>
  );
}
