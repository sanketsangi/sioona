import type { HTMLAttributes, ReactNode } from "react";

type BubbleVariant = "muted" | "default";

/**
 * Local Bubble primitive (geistcn / shadcn-style API).
 * Customer = muted; Agent = default (primary-quiet).
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
      className={`flex w-full max-w-full flex-col gap-1 ${className}`}
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
  const tone =
    variant === "muted"
      ? "bg-sio-bg-muted text-sio-fg-base"
      : "bg-sio-bg-subtle text-sio-fg-base ring-1 ring-inset ring-sio-border-base";

  return (
    <div
      data-variant={variant}
      className={`rounded-md px-3 py-2 text-copy-14 ${tone} ${className}`}
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
    <div className={`flex w-full flex-col gap-3 ${className}`}>{children}</div>
  );
}
