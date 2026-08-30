"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SignalScoreChip } from "@/components/SignalScoreChip";
import { SignalStatus } from "@/components/SignalStatus";
import { SignalTypeChip } from "@/components/SignalTypeChip";
import { SignalUser } from "@/components/SignalUser";
import { primaryQuote, queueSignalSummary } from "@/lib/format";
import type { Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Shared with QueueColumnHeader — keep templates identical so columns line up.
 * Stacked cards below lg. lg: User · Signal · Status · Score · Type · Action.
 * xl: + Evidence before Action. Status track fits “Partially Correct”.
 */
export const QUEUE_GRID =
  "lg:grid-cols-[minmax(9rem,1.1fr)_minmax(0,1.4fr)_8.75rem_4.5rem_7.25rem_5.5rem] xl:grid-cols-[minmax(9rem,1fr)_minmax(0,1.35fr)_8.75rem_4.5rem_7.25rem_minmax(0,1.25fr)_5.5rem]";

/** Horizontal padding + gap shared by header and rows. */
export const QUEUE_ROW_CLASS =
  "grid min-w-0 w-full grid-cols-1 items-center gap-3 px-4";

/** Dense Review control — `--radius-control`, not pill. */
export const QUEUE_REVIEW_ACTION_CLASS =
  "btn-secondary w-full shrink-0 touch-manipulation lg:h-8 lg:max-w-full lg:px-3";

type SignalQueueRowProps = {
  signal: Signal;
  customerName: string;
  selected?: boolean;
  previewHref?: string;
  previewAriaLabel?: string;
  action?: ReactNode;
  /** When true, show full signal summary + evidence (review panel chrome). */
  expandText?: boolean;
};

/**
 * Queue row chrome. Selection opens full-panel review via `?preview=`
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
  const quote = primaryQuote(signal.evidence);
  const evidencePrimary = quote ? `“${quote}”` : "—";
  const signalText = queueSignalSummary(
    signal.summary?.trim() || "",
    customerName,
  );
  const summaryId = `signal-summary-${signal.id}`;

  const summaryClass = expandText
    ? "break-words text-pretty text-copy-14 font-medium text-sio-fg-base"
    : "truncate text-copy-14 font-medium text-sio-fg-base";
  const evidenceClass = expandText
    ? "break-words text-pretty text-copy-14 text-sio-fg-subtle"
    : "truncate text-copy-14 text-sio-fg-subtle";

  const dataCells = (
    <>
      <div className="flex min-w-0 items-start gap-3 lg:contents">
        <SignalUser
          name={customerName}
          showName
          className="min-w-0 max-lg:max-w-[min(11rem,42%)] lg:max-w-full"
        />

        <div className="min-w-0 flex-1 lg:min-w-0">
          <p id={summaryId} className={summaryClass} translate="no">
            {signalText || "No summary available"}
          </p>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 lg:hidden">
            <SignalStatus signal={signal} className="max-w-full" />
            <SignalScoreChip score={signal.score} />
            <SignalTypeChip type={signal.type} />
          </div>
          <p className={cn("mt-2 lg:hidden", evidenceClass)}>
            {evidencePrimary}
          </p>
        </div>
      </div>

      <div className="hidden min-w-0 lg:flex lg:items-center">
        <SignalStatus signal={signal} className="max-w-full" />
      </div>

      <div className="hidden min-w-0 lg:flex lg:items-center">
        <SignalScoreChip score={signal.score} />
      </div>

      <div className="hidden min-w-0 lg:flex lg:items-center">
        <SignalTypeChip type={signal.type} />
      </div>

      <div className="hidden min-w-0 xl:flex xl:items-center">
        <p className={evidenceClass}>{evidencePrimary}</p>
      </div>
    </>
  );

  return (
    <div
      className="list-row flex flex-col"
      data-selected={selected ? "true" : undefined}
      data-expand-text={expandText ? "true" : undefined}
    >
      <div className={cn(QUEUE_ROW_CLASS, QUEUE_GRID, "py-2.5 lg:py-2")}>
        {previewHref ? (
          <Link
            href={previewHref}
            scroll={false}
            aria-label={previewAriaLabel}
            className="contents touch-manipulation outline-none focus-visible:[&>*]:bg-sio-bg-interactive-hover"
          >
            {dataCells}
          </Link>
        ) : (
          dataCells
        )}

        {action ? (
          <div className="flex min-w-0 w-full items-center justify-start">
            {action}
          </div>
        ) : (
          <div className="hidden min-w-0 lg:block" aria-hidden />
        )}
      </div>
    </div>
  );
}
