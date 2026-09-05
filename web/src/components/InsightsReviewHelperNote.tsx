import type { ReactNode } from "react";
import { CircularInfoIcon } from "@/components/icons/CircularInfoIcon";
import { Note, NoteAction, NoteContent } from "@/components/ui/Note";
import { cn } from "@/lib/utils";

/**
 * Shared quiet helper callout for Insights review panes (Feedback,
 * Ground Truth, Incorrect/Partial Adapt). Geist Note density: muted fill,
 * subtle border, ~h-9/min-h-10 row, optional compact action — not a nested Card.
 */
export function InsightsReviewHelperNote({
  children,
  action,
  className,
}: {
  children: ReactNode;
  /** Optional trailing control (e.g. compact Adapt link) — keeps ~helper height. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Note
      icon={<CircularInfoIcon />}
      className={cn(
        "min-h-10 flex-row flex-wrap items-center gap-2 rounded-md border-sio-border-subtle bg-sio-bg-muted px-3 py-1.5 md:flex-row md:items-center md:gap-2",
        action
          ? "justify-between gap-x-3 pr-3 md:justify-between"
          : "pr-10 md:justify-start",
        className,
      )}
    >
      <NoteContent>
        <p className="text-pretty text-copy-14 text-sio-fg-subtle">{children}</p>
      </NoteContent>
      {action ? (
        <NoteAction className="w-auto max-w-full shrink-0 md:w-auto">
          {action}
        </NoteAction>
      ) : null}
    </Note>
  );
}
