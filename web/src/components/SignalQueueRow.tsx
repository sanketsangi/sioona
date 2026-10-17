"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SignalScoreChip } from "@/components/SignalScoreChip";
import { SignalStatus } from "@/components/SignalStatus";
import { SignalTypeChip } from "@/components/SignalTypeChip";
import { SignalUser } from "@/components/SignalUser";
import { TableCell, TableRow } from "@/components/ui/table";
import { queueSignalSummary } from "@/lib/format";
import { signalCommercialLabel } from "@/lib/signal-commercial";
import type { Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Dense queue action layout — pair with `Button` `size="sm"` (`h-7`). */
export const QUEUE_REVIEW_ACTION_CLASS =
  "w-auto shrink-0 touch-manipulation rounded-full px-3";

/** Full-width mobile card CTA — same pill chrome, stretches the row. */
export const QUEUE_CARD_ACTION_CLASS =
  "w-full min-h-11 touch-manipulation rounded-full px-3";

/**
 * Urgency × timeframe × mentioned value. Same hairline `rounded-full` as
 * signal chips, muted so Type / Score stay the primary chrome.
 */
const COMMERCIAL_PILL_CLASS =
  "h-5 w-fit max-w-full min-w-0 items-center truncate rounded-full bg-sio-bg-base px-2 text-label-12 capitalize leading-4 text-sio-fg-muted tabular shadow-[0_0_0_1px_rgba(0,0,0,0.08)]";

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
 * List rows with `previewHref` stretch one Link across the row; Action stays separate.
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
  const commercialLabel = signalCommercialLabel(signal);
  const summaryId = expandText
    ? `signal-review-summary-${signal.id}`
    : `signal-summary-${signal.id}`;
  const isPreviewRow = Boolean(previewHref);

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
      data-queue-preview={isPreviewRow ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      data-expand-text={expandText ? "true" : undefined}
      className={cn(
        "list-row hover:bg-sidebar-accent",
        isPreviewRow &&
          "[&>[data-slot=table-cell]]:pointer-events-none [&_[data-queue-row-link]]:pointer-events-auto [&_[data-queue-action]]:pointer-events-auto has-[[data-queue-row-link]:focus-visible]:bg-sidebar-accent",
        selected && "bg-muted/50",
      )}
    >
      <TableCell className="min-w-[9rem] max-w-[12rem] whitespace-normal">
        {previewHref ? (
          <Link
            href={previewHref}
            scroll={false}
            aria-label={previewAriaLabel}
            data-queue-row-link
            className="z-0 block min-w-0 touch-manipulation rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sio-border-strong after:absolute after:inset-0 after:content-['']"
          >
            {userCell}
          </Link>
        ) : (
          userCell
        )}
      </TableCell>

      <TableCell className="min-w-[12rem] max-w-[20rem] whitespace-normal">
        {signalCell}
      </TableCell>

      <TableCell className="min-w-[8.75rem] whitespace-normal">
        <SignalStatus signal={signal} className="max-w-full" />
      </TableCell>

      <TableCell className="min-w-[4.5rem]">
        <SignalScoreChip
          score={signal.score}
          evidence={signal.evidence}
          type={signal.type}
        />
      </TableCell>

      <TableCell className="min-w-[7.25rem]">
        <div className="flex min-w-0 items-center gap-1.5">
          <SignalTypeChip type={signal.type} />
          {commercialLabel ? (
            <p
              className={cn("flex", COMMERCIAL_PILL_CLASS)}
              title={commercialLabel}
            >
              {commercialLabel}
            </p>
          ) : null}
        </div>
      </TableCell>

      <TableCell className="min-w-[5.5rem] whitespace-normal">
        {action ? (
          <div
            data-queue-action
            className="relative z-[1] flex min-w-0 w-full items-start justify-start"
          >
            {action}
          </div>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

type SignalQueueCardProps = {
  signal: Signal;
  customerName: string;
  previewHref: string;
  previewAriaLabel: string;
  action?: ReactNode;
};

/**
 * Mobile Insights row — vertical card so Status / Score / Type / Action
 * stay visible without horizontal scroll.
 */
export function SignalQueueCard({
  signal,
  customerName,
  previewHref,
  previewAriaLabel,
  action,
}: SignalQueueCardProps) {
  const signalText = queueSignalSummary(
    signal.summary?.trim() || "",
    customerName,
  );
  const commercialLabel = signalCommercialLabel(signal);

  return (
    <li
      data-queue-card
      className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-panel)] border border-sio-border-base bg-sio-bg-base p-3"
    >
      <div className="flex min-w-0 items-start gap-3">
        <Link
          href={previewHref}
          scroll={false}
          aria-label={previewAriaLabel}
          className="min-w-0 flex-1 touch-manipulation outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <SignalUser name={customerName} showName className="min-w-0" />
          <p
            className="mt-1.5 line-clamp-3 break-words text-pretty text-copy-14 font-medium leading-5 text-sio-fg-base"
            translate="no"
          >
            {signalText || "No summary available"}
          </p>
        </Link>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <SignalStatus signal={signal} />
        <SignalTypeChip type={signal.type} />
        <SignalScoreChip
          score={signal.score}
          evidence={signal.evidence}
          type={signal.type}
        />
        {commercialLabel ? (
          <span
            className={cn("inline-flex", COMMERCIAL_PILL_CLASS)}
            title={commercialLabel}
          >
            {commercialLabel}
          </span>
        ) : null}
      </div>
      {action ? (
        <div
          data-queue-action
          className="min-w-0 [&_a]:w-full [&_button]:w-full"
        >
          {action}
        </div>
      ) : null}
    </li>
  );
}
