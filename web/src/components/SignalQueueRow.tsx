"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SignalScoreChip } from "@/components/SignalScoreChip";
import { SignalStatus } from "@/components/SignalStatus";
import { SignalTypeChip } from "@/components/SignalTypeChip";
import { SignalUser } from "@/components/SignalUser";
import { primaryQuote, stripSummaryEvidenceQuote } from "@/lib/format";
import type { Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Shared with QueueColumnHeader — keep templates identical so columns line up.
 * Stacked cards below lg (375 / 768). lg: User · Signal · Status · Score ·
 * Type · Action. xl: + Evidence before Action.
 */
export const QUEUE_GRID =
  "lg:grid-cols-[2.25rem_minmax(0,1fr)_5.75rem_4.5rem_6.75rem_5rem] xl:grid-cols-[2.25rem_minmax(0,1.35fr)_5.75rem_4.5rem_6.75rem_minmax(0,1.25fr)_5rem]";

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
 * (list rows swap for review body; sticky column header stays).
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
  // Full stored summary (includes customer name) — name is avatar-only in User column.
  // Strip legacy quoteHint so Evidence / Why This Fired is the only quote surface.
  const signalText = stripSummaryEvidenceQuote(signal.summary?.trim() || "");
  const summaryId = `signal-summary-${signal.id}`;

  const summaryClass = expandText
    ? "break-words text-pretty text-copy-14 font-medium text-sio-fg-base"
    : "truncate text-copy-14 font-medium text-sio-fg-base";
  const evidenceClass = expandText
    ? "break-words text-pretty text-copy-14 text-sio-fg-subtle"
    : "truncate text-copy-14 text-sio-fg-subtle";

  const dataCells = (
    <>
      <div className="flex min-w-0 items-center gap-2.5 lg:contents">
        <SignalUser
          name={customerName}
          showName={false}
          className="shrink-0 lg:min-w-0"
        />

        <div className="min-w-0 flex-1 lg:min-w-0">
          <p id={summaryId} className={summaryClass} translate="no">
            {signalText || "No summary available"}
          </p>
          <SignalStatus signal={signal} className="mt-1 lg:hidden" />

          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 lg:hidden">
            <div className="min-w-0">
              <dt className="text-label-12 text-sio-fg-muted">Score</dt>
              <dd className="mt-0.5">
                <SignalScoreChip score={signal.score} />
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-label-12 text-sio-fg-muted">Type</dt>
              <dd className="mt-0.5">
                <SignalTypeChip type={signal.type} />
              </dd>
            </div>
            <div className="col-span-2 min-w-0">
              <dt className="text-label-12 text-sio-fg-muted">Evidence</dt>
              <dd className={evidenceClass}>{evidencePrimary}</dd>
            </div>
          </dl>
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
      <div
        className={cn(
          "grid min-w-0 w-full grid-cols-1 items-center gap-2.5 px-3 py-3 lg:gap-3 lg:px-3.5 lg:py-2.5 xl:gap-4",
          QUEUE_GRID,
        )}
      >
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
