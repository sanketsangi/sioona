import Link from "next/link";
import { PartnerDemoButton } from "@/components/PartnerDemoButton";
import { ReDetectButton } from "@/components/ReDetectButton";
import { SignalQueue } from "@/components/SignalQueue";
import { computeEvalMetrics, computePilotMetrics, sortSignals } from "@/lib/eval";
import { formatPercent, signalTypeLabel } from "@/lib/format";
import { ZERO_SIGNAL_HINT } from "@/lib/ingest";
import { viewHref, type StatusFilter, type TypeFilter } from "@/lib/views";
import type { SignalType, StoreData } from "@/lib/types";

const TYPE_ORDER: SignalType[] = ["lead", "retention", "upsell"];

export function InsightsView({
  store,
  demo,
  importedCount,
  newSignalCount,
  statusFilter,
  typeFilter,
  page,
}: {
  store: StoreData;
  demo?: boolean;
  importedCount?: number | null;
  newSignalCount?: number | null;
  statusFilter: StatusFilter;
  typeFilter: TypeFilter;
  page: number;
}) {
  const signals = sortSignals(store.signals);
  const metrics = computeEvalMetrics(store);
  const pilot = computePilotMetrics(store);
  const pendingCount = signals.filter(
    (s) => s.status === "new" || !s.feedback
  ).length;

  const byType = TYPE_ORDER.map((type) => ({
    type,
    count: signals.filter((s) => s.type === type).length,
  }));

  const showImportBanner =
    importedCount != null &&
    !Number.isNaN(importedCount) &&
    newSignalCount != null &&
    !Number.isNaN(newSignalCount);
  const zeroSignalsImport = showImportBanner && newSignalCount === 0;

  const queryExtras: Record<string, string | undefined | null> = {
    demo: demo ? "1" : null,
    imported:
      importedCount != null && !Number.isNaN(importedCount)
        ? String(importedCount)
        : null,
    signals:
      newSignalCount != null && !Number.isNaN(newSignalCount)
        ? String(newSignalCount)
        : null,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {demo ? (
        <div
          className="status-banner status-banner-accent shrink-0"
          role="status"
          aria-live="polite"
        >
          <p className="text-copy-14 text-ds-gray-1000">
            Partner demo ready — review pending signals below, then open Eval
            for precision and lift.
          </p>
        </div>
      ) : null}

      {pilot.baselineOpportunities > 0 || demo ? (
        <section
          className="metric-strip shrink-0"
          aria-label="Opportunity lift comparison"
        >
          <div className="metric-grid-3">
            <div className="metric-cell">
              <div className="metric-label">Their Process</div>
              <div className="metric-value">
                {pilot.baselineOpportunities}
              </div>
              <p className="mt-1 line-clamp-2 text-label-12 text-ds-gray-900">
                {store.pilot?.baselineNote?.trim()
                  ? store.pilot.baselineNote
                  : "Baseline opportunities flagged today"}
              </p>
            </div>
            <div className="metric-cell">
              <div className="metric-label">
                <span translate="no">Sioona</span> Found
              </div>
              <div className="metric-value">{pilot.sioonaOpportunities}</div>
              <p className="mt-1 text-label-12 text-ds-gray-900">
                Conversations with ≥1 revenue signal
              </p>
            </div>
            <div className="metric-cell">
              <div className="metric-label">Missed / Lift</div>
              <div
                className={`metric-value ${
                  pilot.opportunityLift > 0
                    ? "text-ds-green-900"
                    : "text-ds-gray-1000"
                }`}
              >
                {pilot.opportunityLift >= 0 ? "+" : ""}
                {pilot.opportunityLift}
              </div>
              <p className="mt-1 text-label-12 text-ds-gray-900">
                Opportunities your desk would likely miss
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {showImportBanner ? (
        <div
          className={`status-banner shrink-0 ${
            zeroSignalsImport
              ? "status-banner-warning"
              : "status-banner-success"
          }`}
          role="status"
          aria-live="polite"
        >
          <p className="text-copy-14 text-ds-gray-1000">
            Imported {importedCount} conversations · {newSignalCount} new
            signals.
            {zeroSignalsImport
              ? ` ${ZERO_SIGNAL_HINT}`
              : " Review the queue below."}
          </p>
          {zeroSignalsImport ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <PartnerDemoButton label="Run Partner Demo" />
              <Link href={viewHref("upload")} className="btn-secondary">
                Upload Another File
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      <section className="metric-strip shrink-0">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ds-gray-400 px-4 py-3">
          <div className="min-w-0">
            <p className="tabular text-heading-20 text-ds-gray-1000">
              {pilot.sioonaOpportunities}
              <span className="ml-2 text-copy-14 font-normal text-ds-gray-900">
                opportunities
              </span>
            </p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-label-13 text-ds-gray-900">
              {byType.map(({ type, count }) => (
                <p key={type}>
                  <span className="tabular text-ds-gray-1000">{count}</span>{" "}
                  {signalTypeLabel(type)}
                </p>
              ))}
            </div>
          </div>
          <Link href={viewHref("eval")} className="btn-secondary shrink-0">
            Open Eval
          </Link>
        </div>
        <div className="metric-grid-stats">
          <Stat label="Signals" value={String(store.signals.length)} />
          <Stat label="Pending" value={String(pendingCount)} />
          <Stat label="Chats" value={String(store.conversations.length)} />
          <Stat
            label="Review P"
            value={formatPercent(metrics.reviewPrecision)}
          />
          <Stat
            label="Labeled P"
            value={formatPercent(metrics.labeledPrecision)}
          />
        </div>
      </section>

      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-label-13 text-ds-gray-900">
          Queue ·{" "}
          <span className="text-ds-gray-1000" translate="no">
            {store.tenant.name}
          </span>
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <PartnerDemoButton
            className="btn-secondary w-full sm:w-auto"
            label="Run Partner Demo"
          />
          <ReDetectButton />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <SignalQueue
          signals={signals}
          statusFilter={statusFilter}
          typeFilter={typeFilter}
          page={page}
          queryExtras={queryExtras}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-cell">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}
