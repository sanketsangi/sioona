"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SignalScoreChip } from "@/components/SignalScoreChip";
import { SignalStatus } from "@/components/SignalStatus";
import { SignalTypeChip } from "@/components/SignalTypeChip";
import { SignalUser } from "@/components/SignalUser";
import { primaryQuote } from "@/lib/format";
import type { Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Desktop queue columns: User (avatar) · Signal · Status · Score · Type (+ Evidence @ lg; Action outside). */
export const QUEUE_GRID =
  "sm:grid-cols-[2.25rem_minmax(0,1fr)_4.5rem_4rem_5.75rem] lg:grid-cols-[2.25rem_minmax(0,1.45fr)_5rem_4.75rem_6.5rem_minmax(0,1.35fr)]";

/** Panel chrome: same columns, evidence visible from sm so full text can grow. */
const PANEL_GRID =
  "sm:grid-cols-[2.25rem_minmax(0,1fr)_4.5rem_4rem_5.75rem_minmax(0,1.35fr)] lg:grid-cols-[2.25rem_minmax(0,1.45fr)_5rem_4.75rem_6.5rem_minmax(0,1.35fr)]";

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
  const signalText = signal.summary?.trim() || "";
  const summaryId = `signal-summary-${signal.id}`;

  const summaryClass = expandText
    ? "break-words text-pretty text-copy-14 font-medium text-sio-fg-base"
    : "truncate text-copy-14 font-medium text-sio-fg-base";
  const evidenceClass = expandText
    ? "break-words text-pretty text-copy-14 text-sio-fg-subtle"
    : "truncate text-copy-14 text-sio-fg-subtle";

  const cells = (
    <>
      <div className="flex min-w-0 items-start gap-2.5 sm:contents">
        <SignalUser
          name={customerName}
          showName={false}
          className={cn(
            "shrink-0 sm:min-w-0",
            expandText ? "mt-0.5" : "mt-0.5 sm:mt-0",
          )}
        />

        <div className="min-w-0 flex-1">
          <p id={summaryId} className={summaryClass} translate="no">
            {signalText || "No summary available"}
          </p>
          <SignalStatus signal={signal} className="mt-1 sm:hidden" />

          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 sm:hidden">
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

      <div
        className={cn(
          "hidden min-w-0 sm:flex",
          expandText ? "sm:items-start sm:pt-0.5" : "sm:items-center",
        )}
      >
        <SignalStatus signal={signal} className="max-w-full" />
      </div>

      <div
        className={cn(
          "hidden min-w-0 sm:block",
          expandText && "sm:pt-0.5",
        )}
      >
        <SignalScoreChip score={signal.score} />
      </div>

      <div
        className={cn(
          "hidden min-w-0 sm:block",
          expandText && "sm:pt-0.5",
        )}
      >
        <SignalTypeChip type={signal.type} />
      </div>

      <div
        className={cn(
          "hidden min-w-0",
          expandText ? "sm:block sm:pt-0.5" : "lg:block",
        )}
      >
        <p className={evidenceClass}>{evidencePrimary}</p>
      </div>
    </>
  );

  const gridClassName = cn(
    "grid min-w-0 flex-1 grid-cols-1 gap-2.5 lg:gap-4",
    expandText
      ? cn(PANEL_GRID, "sm:items-start sm:gap-3")
      : cn(QUEUE_GRID, "sm:items-center sm:gap-3"),
    previewHref &&
      "touch-manipulation outline-none transition-[color,background-color] duration-150 focus-visible:bg-sio-bg-interactive-hover focus-visible:shadow-[inset_0_0_0_1px_var(--sio-focus-accent),inset_0_0_0_3px_color-mix(in_srgb,var(--sio-focus-accent)_35%,transparent)]",
  );

  return (
    <div
      className="list-row flex flex-col"
      data-selected={selected ? "true" : undefined}
      data-expand-text={expandText ? "true" : undefined}
    >
      <div
        className={cn(
          "flex flex-col gap-2.5 px-3 py-3 sm:flex-row sm:gap-3 sm:px-3.5 sm:py-2.5",
          expandText ? "sm:items-start" : "sm:items-center",
        )}
      >
        {previewHref ? (
          <Link
            href={previewHref}
            scroll={false}
            aria-label={previewAriaLabel}
            className={gridClassName}
          >
            {cells}
          </Link>
        ) : (
          <div className={gridClassName}>{cells}</div>
        )}
        {action ? (
          <div
            className={cn(
              "w-full shrink-0 sm:flex sm:w-[4.5rem] sm:justify-start",
              expandText && "sm:pt-0.5",
            )}
          >
            {action}
          </div>
        ) : null}
      </div>
    </div>
  );
}
