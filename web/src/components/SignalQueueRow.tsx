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
  "grid min-w-0 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 sm:px-4";

/** Quiet Review control — hug-width tertiary; 44px on mobile, 32px on desktop. */
export const QUEUE_REVIEW_ACTION_CLASS =
  "btn-tertiary shrink-0 touch-manipulation lg:h-8 lg:px-2";

type SignalQueueRowProps = {
  signal: Signal;
  customerName: string;
  selected?: boolean;
  previewHref?: string;
  previewAriaLabel?: string;
  action?: ReactNode;
  /** When true, show the review identity strip (not the queue table). */
  expandText?: boolean;
};

/**
 * Queue row chrome. List rows open full-panel review via `?preview=`.
 * `expandText` is the review identity strip — locked chips + summary,
 * no table columns and no Review control.
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

  if (expandText) {
    return (
      <div
        className="flex flex-col bg-sio-bg-base"
        data-selected={selected ? "true" : undefined}
        data-expand-text="true"
        aria-current={selected ? "true" : undefined}
      >
        <div className="flex min-w-0 flex-col gap-2.5 px-3 py-3 sm:px-4">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <SignalUser
              name={customerName}
              size={32}
              showName
              className="min-w-0"
            />
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
              <SignalStatus signal={signal} className="max-w-full" />
              <SignalScoreChip score={signal.score} />
              <SignalTypeChip type={signal.type} />
            </div>
          </div>
          <p
            id={summaryId}
            className="break-words text-pretty text-copy-14 font-medium text-sio-fg-base"
            translate="no"
          >
            {signalText || "No summary available"}
          </p>
          {quote ? (
            <p className="break-words text-pretty text-copy-14 text-sio-fg-subtle">
              {evidencePrimary}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  const summaryClass = "truncate text-copy-14 font-medium text-sio-fg-base";
  const evidenceClass = "truncate text-copy-14 text-sio-fg-subtle";

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
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 lg:hidden">
            <SignalStatus signal={signal} className="max-w-full" />
            <SignalScoreChip score={signal.score} />
            <SignalTypeChip type={signal.type} />
          </div>
          <p className={cn("mt-1.5 lg:hidden", evidenceClass)}>
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
      aria-current={selected ? "true" : undefined}
    >
      <div className={cn(QUEUE_ROW_CLASS, QUEUE_GRID, "py-2.5")}>
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
          <div className="flex shrink-0 items-start self-start lg:items-center lg:self-center">
            {action}
          </div>
        ) : (
          <div className="hidden min-w-0 lg:block" aria-hidden />
        )}
      </div>
    </div>
  );
}
