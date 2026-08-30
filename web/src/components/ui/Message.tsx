import type { HTMLAttributes, ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

/** Matches header `SignalUser` + radix-vega `size-8`. */
export const MESSAGE_AVATAR_SIZE = 32;

export type MessageAlign = "start" | "end";

/**
 * Local Message primitive (geistcn / shadcn-style API).
 * Row is always `w-full` so packing can hug an edge:
 * - `align="start"` → agent left (`flex-row` + `justify-start`)
 * - `align="end"` → customer right (`flex-row-reverse` + `justify-start`)
 * Bubble/content hug text (`w-fit`); row stays `w-full`.
 */
export function Message({
  children,
  align = "start",
  className = "",
}: {
  children: ReactNode;
  align?: MessageAlign;
  className?: string;
}) {
  const isEnd = align === "end";
  return (
    <div
      data-align={align}
      className={cn(
        "flex w-full max-w-full items-start gap-2",
        isEnd ? "flex-row-reverse justify-start" : "flex-row justify-start",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Avatar slot — pass composed `<Avatar>` children (demo API), or `letter` for initials.
 */
export function MessageAvatar({
  children,
  letter,
  className = "",
}: {
  children?: ReactNode;
  letter?: string;
  className?: string;
}) {
  if (children) {
    return <div className={cn("mt-0.5 shrink-0", className)}>{children}</div>;
  }
  return (
    <Avatar
      letter={letter}
      placeholder
      size={MESSAGE_AVATAR_SIZE}
      className={cn("mt-0.5", className)}
    />
  );
}

export function MessageContent({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "min-w-0 w-fit max-w-[min(24rem,calc(100%-2.5rem))]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
