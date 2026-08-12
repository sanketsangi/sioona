import Link from "next/link";
import type { ReactNode } from "react";
import { SignalScoreChip } from "@/components/SignalScoreChip";
import { SignalStatus } from "@/components/SignalStatus";
import { SignalTypeChip } from "@/components/SignalTypeChip";
import { SignalUser } from "@/components/SignalUser";
import { primaryQuote, queueSignalSummary } from "@/lib/format";
import type { Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Desktop queue columns: User · Signal · Status · Score · Type (+ Evidence @ lg; Action outside). */
export const QUEUE_GRID =
  "sm:grid-cols-[minmax(6.5rem,0.85fr)_minmax(0,1.5fr)_4.75rem_4.5rem_6.75rem] lg:grid-cols-[minmax(7rem,0.9fr)_minmax(0,1.45fr)_5rem_4.75rem_7rem_minmax(0,1.35fr)]";

const QUEUE_GRID_CLASS = `grid min-w-0 flex-1 grid-cols-1 gap-2.5 sm:items-center sm:gap-3 lg:gap-4 ${QUEUE_GRID}`;

type SignalQueueRowProps = {
  signal: Signal;
  customerName: string;
  selected?: boolean;
  previewHref?: string;
  previewAriaLabel?: string;
  action?: ReactNode;
};

export function SignalQueueRow({
  signal,
  customerName,
  selected = false,
  previewHref,
  previewAriaLabel,
  action,
}: SignalQueueRowProps) {
  const quote = primaryQuote(signal.evidence);
  const evidencePrimary = quote ? `“${quote}”` : "—";
  const signalText = queueSignalSummary(signal.summary || "", customerName);

  const cells = (
    <>
      <div className="flex min-w-0 items-start gap-2.5 sm:contents">
        <SignalUser
          name={customerName}
          className="mt-0.5 shrink-0 sm:mt-0 sm:min-w-0 max-sm:[&_.signal-user-name]:hidden"
        />

        <div className="min-w-0 flex-1">
          <p
            className="truncate text-label-13 font-medium text-sio-fg-base sm:hidden"
            translate="no"
          >
            {customerName}
          </p>
          <p className="mt-0.5 truncate text-copy-14 font-medium text-sio-fg-base sm:mt-0">
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
              <dd className="truncate text-copy-14 text-sio-fg-subtle">
                {evidencePrimary}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="hidden min-w-0 sm:flex sm:items-center">
        <SignalStatus signal={signal} className="max-w-full" />
      </div>

      <div className="hidden min-w-0 sm:block">
        <SignalScoreChip score={signal.score} />
      </div>

      <div className="hidden min-w-0 sm:block">
        <SignalTypeChip type={signal.type} />
      </div>

      <div className="hidden min-w-0 lg:block">
        <p className="truncate text-copy-14 text-sio-fg-subtle">
          {evidencePrimary}
        </p>
      </div>
    </>
  );

  const gridClassName = cn(
    QUEUE_GRID_CLASS,
    previewHref &&
      "touch-manipulation outline-none transition-[color,background-color] duration-150 focus-visible:bg-sio-bg-interactive-hover focus-visible:shadow-[inset_0_0_0_1px_var(--sio-focus-accent),inset_0_0_0_3px_color-mix(in_srgb,var(--sio-focus-accent)_35%,transparent)]",
  );

  return (
    <div
      className={cn(
        "list-row flex flex-col gap-2.5 px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-3.5 sm:py-2.5",
        selected &&
          "bg-sio-bg-interactive before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0.5 before:rounded-sm before:bg-sio-fg-base",
      )}
    >
      {previewHref ? (
        <Link
          href={previewHref}
          scroll={false}
          aria-current={selected ? "true" : undefined}
          aria-label={previewAriaLabel}
          className={gridClassName}
        >
          {cells}
        </Link>
      ) : (
        <div className={gridClassName}>{cells}</div>
      )}
      {action}
    </div>
  );
}
