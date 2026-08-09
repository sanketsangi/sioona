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
    <div className="flex flex-col gap-5 sm:gap-6">
      {demo ? (
        <div
          className="status-banner status-banner-accent"
          role="status"
          aria-live="polite"
        >
          <p className="text-pretty text-copy-14 text-ds-gray-1000">
            Partner demo ready — review pending signals below, then open Eval
            for precision and lift.
          </p>
        </div>
      ) : null}

      {showImportBanner ? (
        <div
          className={`status-banner ${
            zeroSignalsImport
              ? "status-banner-warning"
              : "status-banner-success"
          }`}
          role="status"
          aria-live="polite"
        >
          <p className="text-pretty text-copy-14 text-ds-gray-1000">
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

      <section className="metric-strip" aria-labelledby="insights-overview">
        <div className="metric-bar">
          <div className="min-w-0">
            <h2 id="insights-overview" className="sr-only">
              Signal overview
            </h2>
            <p className="tabular text-heading-24 text-ds-gray-1000">
              {pilot.sioonaOpportunities}
              <span className="ml-2 text-copy-14 font-normal text-ds-gray-900">
                opportunities
              </span>
            </p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-label-13 text-ds-gray-900">
              {byType.map(({ type, count }) => (
                <p key={type}>
                  <span className="tabular font-medium text-ds-gray-1000">
                    {count}
                  </span>{" "}
                  {signalTypeLabel(type)}
                </p>
              ))}
            </div>
          </div>
          <Link href={viewHref("eval")} className="btn-secondary shrink-0">
            Open Eval
          </Link>
        </div>
        {/* Odd final cell stretches so the row never ends mid-grid */}
        <div className="metric-grid grid-cols-2 [&>*:last-child]:col-span-2 sm:grid-cols-3 sm:[&>*:last-child]:col-span-2 lg:grid-cols-5 lg:[&>*:last-child]:col-span-1">
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

      {pilot.baselineOpportunities > 0 || demo ? (
        <section
          className="metric-strip"
          aria-label="Opportunity lift comparison"
        >
          <div className="metric-grid grid-cols-1 sm:grid-cols-3">
            <div className="metric-cell">
              <div className="metric-label">Their Process</div>
              <div className="metric-value">
                {pilot.baselineOpportunities}
              </div>
              <p className="mt-1 text-pretty text-label-12 text-ds-gray-900">
                {store.pilot?.baselineNote?.trim()
                  ? store.pilot.baselineNote
                  : "Baseline opportunities flagged today"}
              </p>
            </div>
            <div className="metric-cell">
              <div className="metric-label">Sioona Found</div>
              <div className="metric-value">{pilot.sioonaOpportunities}</div>
              <p className="mt-1 text-pretty text-label-12 text-ds-gray-900">
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
              <p className="mt-1 text-pretty text-label-12 text-ds-gray-900">
                Opportunities your desk would likely miss
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-heading-16 text-ds-gray-1000">
            Review Queue
            <span className="ml-2 text-copy-14 font-normal text-ds-gray-900">
              <span translate="no">{store.tenant.name}</span>
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <PartnerDemoButton
              className="btn-secondary"
              label="Run Partner Demo"
            />
            <ReDetectButton />
          </div>
        </div>

        <SignalQueue
          signals={signals}
          statusFilter={statusFilter}
          typeFilter={typeFilter}
          page={page}
          queryExtras={queryExtras}
        />
      </section>
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
