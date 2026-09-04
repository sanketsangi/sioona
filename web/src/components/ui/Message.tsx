import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** Matches header `SignalUser` + radix-vega `size-8`. */
export const MESSAGE_AVATAR_SIZE = 32;

export type MessageAlign = "start" | "end";

/**
 * June 2026 shadcn Message — adapted for Insights transcript.
 * Row is always full-width so packing can hug an edge:
 * - `align="start"` → agent left
 * - `align="end"` → customer right (`flex-row-reverse`)
 */
function Message({
  className,
  align = "start",
  ...props
}: ComponentProps<"div"> & { align?: MessageAlign }) {
  return (
    <div
      data-slot="message"
      data-align={align}
      className={cn(
        "group/message relative flex w-full min-w-0 max-w-full items-start gap-2 text-sm",
        align === "end"
          ? "flex-row-reverse justify-start"
          : "flex-row justify-start",
        className,
      )}
      {...props}
    />
  );
}

function MessageAvatar({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="message-avatar"
      className={cn(
        "mt-0.5 flex w-fit min-w-8 shrink-0 items-center justify-center self-start overflow-hidden rounded-full bg-sio-bg-muted group-has-data-[slot=message-footer]/message:self-end group-has-data-[slot=message-footer]/message:-translate-y-8",
        className,
      )}
      {...props}
    />
  );
}

function MessageContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="message-content"
      className={cn(
        /* Avatar (32) + gap-2 (8) — hug the column; no fixed rem cap. */
        "flex min-w-0 w-fit max-w-[calc(100%-2.5rem)] flex-col gap-1 break-words group-data-[align=end]/message:*:data-[slot]:self-end",
        className,
      )}
      {...props}
    />
  );
}

function MessageFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="message-footer"
      className={cn(
        "flex max-w-full min-w-0 items-center px-0.5 text-label-12 font-medium text-sio-fg-muted group-has-data-[variant=ghost]/message:px-0 group-data-[align=end]/message:justify-end",
        className,
      )}
      {...props}
    />
  );
}

export {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
};
