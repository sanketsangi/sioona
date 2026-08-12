import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

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
      className={`flex shrink-0 flex-col gap-3 rounded-lg border border-sio-border-base bg-sio-bg-base px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${className}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {icon != null ? (
          <span
            className="inline-flex size-4 shrink-0 items-center justify-center"
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
      className={`min-w-0 flex-1 text-label-13 text-sio-fg-subtle ${className}`}
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
      className={`flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end ${className}`}
      role={ariaLabel ? "group" : undefined}
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}
