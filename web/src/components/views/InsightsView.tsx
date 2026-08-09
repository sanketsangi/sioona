import Link from "next/link";
import { PartnerDemoButton } from "@/components/PartnerDemoButton";
import { ReDetectButton } from "@/components/ReDetectButton";
import { SignalQueue } from "@/components/SignalQueue";
import { SignalScoreSummary } from "@/components/SignalScoreSummary";
import { Week1PilotStrip } from "@/components/Week1PilotStrip";
import type { BackendSignalScore } from "@/lib/backend-client";
import { applyBackendSignalScoreToPilot } from "@/lib/eval";
import { formatPercent, signalTypeLabel } from "@/lib/format";
import { ZERO_SIGNAL_HINT } from "@/lib/ingest";
import type { NeedsReviewResult } from "@/lib/fetch-needs-review";
import {
  joinNeedsReviewPredictions,
  reviewedSignalsFromStore,
} from "@/lib/join-needs-review";
import { hasMidWeekExport, hasPilotBaseline } from "@/lib/pilot-cadence";
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
  backendScore = null,
  needsReview,
  syncFailed = 0,
  syncCreated = 0,
}: {
  store: StoreData;
  demo?: boolean;
  importedCount?: number | null;
  newSignalCount?: number | null;
  statusFilter: StatusFilter;
  typeFilter: TypeFilter;
  page: number;
  backendScore?: BackendSignalScore | null;
  needsReview: NeedsReviewResult;
  syncFailed?: number;
  syncCreated?: number;
}) {
  const pilot = applyBackendSignalScoreToPilot(store, backendScore);
  const queueError = needsReview.ok ? null : needsReview.error;
  const pendingSignals = needsReview.ok
    ? joinNeedsReviewPredictions(needsReview.predictions, store.signals)
    : [];
  const reviewedSignals = reviewedSignalsFromStore(store.signals);
  const pendingCount = needsReview.ok ? pendingSignals.length : null;
  const reviewedCount =
    backendScore?.reviewed_count ?? reviewedSignals.length;

  const byType = TYPE_ORDER.map((type) => ({
    type,
    count: store.signals.filter((s) => s.type === type).length,
  }));

  const showImportBanner =
    importedCount != null &&
    !Number.isNaN(importedCount) &&
    newSignalCount != null &&
    !Number.isNaN(newSignalCount);
  const zeroSignalsImport = showImportBanner && newSignalCount === 0;
  const hasSyncFailure = syncFailed > 0;
  const hasDay1 =
    Boolean(demo) ||
    (showImportBanner && !zeroSignalsImport) ||
    store.signals.length > 0;
  // Cold demo alone is Day 1; partner file ingest increments weeklyExportCount.
  const hasMidWeekUpload =
    hasMidWeekExport(store.pilot?.weeklyExportCount) ||
    Boolean(showImportBanner && !zeroSignalsImport && !demo);
  const hasBaseline = hasPilotBaseline(
    store.pilot?.baselineOpportunities ?? 0,
    store.pilot?.baselineNote
  );

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
    syncFailed: hasSyncFailure ? String(syncFailed) : null,
    syncCreated: hasSyncFailure ? String(syncCreated) : null,
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
            Partner demo ready — review Neon pending below, then open Eval for
            precision and lift.
          </p>
        </div>
      ) : null}

      {hasSyncFailure ? (
        <div
          className="status-banner status-banner-warning shrink-0"
          role="alert"
        >
          <p className="text-copy-14 text-ds-gray-1000">
            Neon dual-write incomplete — {syncFailed} prediction
            {syncFailed === 1 ? "" : "s"} not written
            {syncCreated > 0 ? ` (${syncCreated} succeeded)` : ""}. Local import
            does not mean the pending queue is ready. Start FastAPI (
            <span translate="no">BACKEND_URL</span>), then Re-run Detection.
          </p>
          <div className="mt-3">
            <ReDetectButton />
          </div>
        </div>
      ) : null}

      {pilot.baselineOpportunities > 0 || demo ? (
        <section
          className="metric-strip shrink-0"
          aria-label="Opportunity lift comparison"
        >
          <div className="grid grid-cols-3 divide-x divide-ds-gray-400">
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
              <div className="metric-label">Sioona Found</div>
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
            zeroSignalsImport || hasSyncFailure
              ? "status-banner-warning"
              : "status-banner-success"
          }`}
          role="status"
          aria-live="polite"
        >
          <p className="text-copy-14 text-ds-gray-1000">
            Imported {importedCount} conversations · {newSignalCount} local
            signals.
            {zeroSignalsImport
              ? ` ${ZERO_SIGNAL_HINT}`
              : hasSyncFailure
                ? " Neon sync failed for some predictions — pending queue may be incomplete."
                : " Neon pending queue is ready to review below."}
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

      <Week1PilotStrip
        surface="insights"
        reviewedCount={reviewedCount}
        hasDay1={hasDay1}
        hasMidWeekUpload={hasMidWeekUpload}
        hasBaseline={hasBaseline}
      />

      <SignalScoreSummary score={backendScore} />

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
        <div className="grid grid-cols-2 divide-x divide-y divide-ds-gray-400 sm:grid-cols-4 sm:divide-y-0">
          <Stat label="Signals" value={String(store.signals.length)} />
          <Stat
            label="Pending"
            value={pendingCount === null ? "—" : String(pendingCount)}
          />
          <Stat label="Chats" value={String(store.conversations.length)} />
          <Stat
            label="Labeled P"
            value={formatPercent(pilot.labeledPrecision)}
          />
        </div>
      </section>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <p className="text-label-13 text-ds-gray-900">
          Queue · Neon needs-review ·{" "}
          <span className="text-ds-gray-1000" translate="no">
            {store.tenant.name}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <PartnerDemoButton
            className="btn-secondary"
            label="Run Partner Demo"
          />
          <ReDetectButton />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <SignalQueue
          pendingSignals={pendingSignals}
          reviewedSignals={reviewedSignals}
          queueError={queueError}
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
