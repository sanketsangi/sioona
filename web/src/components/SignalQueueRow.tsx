"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SignalScoreChip } from "@/components/SignalScoreChip";
import { SignalStatus } from "@/components/SignalStatus";
import { SignalTypeChip } from "@/components/SignalTypeChip";
import { SignalUser } from "@/components/SignalUser";
import { TableCell, TableRow } from "@/components/ui/table";
import { queueSignalSummary } from "@/lib/format";
import type { Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Dense Review control — `--radius-control`, not pill. Matches 28px User band. */
export const QUEUE_REVIEW_ACTION_CLASS =
  "btn-secondary w-full shrink-0 touch-manipulation h-7 max-w-full px-3";

type SignalQueueRowProps = {
  signal: Signal;
  customerName: string;
  selected?: boolean;
  previewHref?: string;
  previewAriaLabel?: string;
  action?: ReactNode;
  /** When true, show full signal summary (review panel chrome). */
  expandText?: boolean;
};

/**
 * Queue table row. Selection opens full-panel review via `?preview=`
 * (list rows swap for review body; column header stays).
 */
export function SignalQueueRow({
  signal,
  customerName,
  selected = false,
  previewHref,
  previewAriaLabel,
  action,
  expandText = false,
}: SignalQueueRowProps) {
  const signalText = queueSignalSummary(
    signal.summary?.trim() || "",
    customerName,
  );
  const summaryId = `signal-summary-${signal.id}`;

  const summaryClass = expandText
    ? "break-words text-pretty whitespace-normal text-copy-14 font-medium leading-7 text-sio-fg-base"
    : "truncate text-copy-14 font-medium leading-7 text-sio-fg-base";

  const userCell = (
    <SignalUser
      name={customerName}
      showName
      className="min-w-0 max-w-[11rem]"
    />
  );

  const signalCell = (
    <p id={summaryId} className={summaryClass} translate="no">
      {signalText || "No summary available"}
    </p>
  );

  return (
    <TableRow
      data-queue-row
      data-selected={selected ? "true" : undefined}
      data-expand-text={expandText ? "true" : undefined}
      className={cn(
        "list-row",
        selected && "bg-muted/50",
      )}
    >
      <TableCell className="min-w-[9rem] max-w-[12rem] whitespace-normal">
        {previewHref ? (
          <Link
            href={previewHref}
            scroll={false}
            aria-label={previewAriaLabel}
            className="block min-w-0 touch-manipulation rounded-[var(--radius-control)] outline-none focus-visible:bg-sio-bg-interactive-hover focus-visible:shadow-[var(--focus-ring)]"
          >
            {userCell}
          </Link>
        ) : (
          userCell
        )}
      </TableCell>

      <TableCell className="min-w-[12rem] max-w-[20rem] whitespace-normal">
        {previewHref ? (
          <Link
            href={previewHref}
            scroll={false}
            tabIndex={-1}
            aria-hidden
            className="block min-w-0 touch-manipulation rounded-[var(--radius-control)] outline-none focus-visible:bg-sio-bg-interactive-hover"
          >
            {signalCell}
          </Link>
        ) : (
          signalCell
        )}
      </TableCell>

      <TableCell className="min-w-[8.75rem] whitespace-normal">
        <SignalStatus signal={signal} className="max-w-full" />
      </TableCell>

      <TableCell className="min-w-[4.5rem]">
        <SignalScoreChip score={signal.score} />
      </TableCell>

      <TableCell className="min-w-[7.25rem]">
        <SignalTypeChip type={signal.type} />
      </TableCell>

      <TableCell className="min-w-[5.5rem] whitespace-normal">
        {action ? (
          <div className="flex min-w-0 w-full items-start justify-start">
            {action}
          </div>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
