import type { HTMLAttributes, ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";

export type MessageAlign = "start" | "end";

/**
 * Local Message primitive (geistcn / shadcn-style API).
 * Row is always `w-full` so packing can hug an edge:
 * - `align="start"` → agent left (`flex-row` + `justify-start`)
 * - `align="end"` → customer right (`flex-row-reverse` + `justify-start`)
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
      className={`flex w-full max-w-full gap-2 ${
        isEnd ? "flex-row-reverse justify-start" : "flex-row justify-start"
      } ${className}`}
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
    return <div className={`mt-0.5 shrink-0 ${className}`}>{children}</div>;
  }
  return (
    <Avatar
      letter={letter}
      placeholder
      size={28}
      className={`mt-0.5 ${className}`}
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
      className={`min-w-0 max-w-[min(24rem,calc(100%-2.5rem))] ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
