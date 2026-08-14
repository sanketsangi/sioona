import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type NoteProps = {
  children: ReactNode;
  /** Custom icon; pass `null` to hide. */
  icon?: ReactNode | null;
  className?: string;
};

/**
 * Local Note primitive matching `@vercel/geistcn` Note / NoteContent / NoteAction.
 * geistcn is not on public npm — keep API-aligned for drop-in later.
 */
export function Note({ children, icon, className = "" }: NoteProps) {
  const items = Children.toArray(children);
  const content = items.find(
    (child) => isValidElement(child) && child.type === NoteContent
  ) as ReactElement | undefined;
  const action = items.find(
    (child) => isValidElement(child) && child.type === NoteAction
  ) as ReactElement | undefined;
  const rest = items.filter((child) => child !== content && child !== action);

  return (
    <div
      role="note"
      className={cn(
        "flex shrink-0 flex-col gap-3 rounded-lg border border-sio-border-base bg-sio-bg-base px-3.5 py-3 md:flex-row md:items-center md:justify-between md:gap-4",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5 md:min-w-0 md:items-center">
        {icon != null ? (
          <span
            className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center md:mt-0"
            aria-hidden
          >
            {icon}
          </span>
        ) : null}
        {content}
        {rest}
      </div>
      {action}
    </div>
  );
}

export function NoteContent({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 flex-1 text-label-13 text-sio-fg-subtle",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function NoteAction({
  children,
  className = "",
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full max-w-full shrink-0 flex-nowrap items-center gap-2 md:w-auto md:justify-end",
        className,
      )}
      role={ariaLabel ? "group" : undefined}
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}
