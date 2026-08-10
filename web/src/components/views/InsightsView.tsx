import Link from "next/link";
import { ClearStaleSyncFailedParams } from "@/components/ClearStaleSyncFailedParams";
import { PartnerDemoButton } from "@/components/PartnerDemoButton";
import { ReDetectButton } from "@/components/ReDetectButton";
import { SignalPreviewPanel } from "@/components/SignalPreviewPanel";
import { SignalQueue } from "@/components/SignalQueue";
// Hidden on Insights for now
// import { SignalScoreSummary } from "@/components/SignalScoreSummary";
import type { BackendSignalScore } from "@/lib/backend-client";
import { applyBackendSignalScoreToPilot } from "@/lib/eval";
import { ZERO_SIGNAL_HINT } from "@/lib/ingest";
import type { NeedsReviewResult } from "@/lib/fetch-needs-review";
import {
  joinNeedsReviewPredictions,
  reviewedSignalsFromStore,
} from "@/lib/join-needs-review";
// import { hasMidWeekExport, hasPilotBaseline } from "@/lib/pilot-cadence";
import { shouldShowSyncFailureBanner } from "@/lib/prediction-sync";
import { viewHref, type StatusFilter, type TypeFilter } from "@/lib/views";
import type { Signal, StoreData } from "@/lib/types";

export function InsightsView({
  store,
  demo,
  importedCount,
  newSignalCount,
  statusFilter,
  typeFilter,
  page,
  previewId = null,
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
  previewId?: string | null;
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
  // Pilot strip inputs — restore with Week1PilotStrip
  // const reviewedCount =
  //   backendScore?.reviewed_count ?? reviewedSignals.length;

  const showImportBanner =
    importedCount != null &&
    !Number.isNaN(importedCount) &&
    newSignalCount != null &&
    !Number.isNaN(newSignalCount);
  const zeroSignalsImport = showImportBanner && newSignalCount === 0;
  const hasSyncFailure = shouldShowSyncFailureBanner(
    syncFailed,
    store.signals
  );
  const staleSyncFailedParam = syncFailed > 0 && !hasSyncFailure;
  // const hasDay1 =
  //   Boolean(demo) ||
  //   (showImportBanner && !zeroSignalsImport) ||
  //   store.signals.length > 0;
  // // Cold demo alone is Day 1; partner file ingest increments weeklyExportCount.
  // const hasMidWeekUpload =
  //   hasMidWeekExport(store.pilot?.weeklyExportCount) ||
  //   Boolean(showImportBanner && !zeroSignalsImport && !demo);
  // const hasBaseline = hasPilotBaseline(
  //   store.pilot?.baselineOpportunities ?? 0,
  //   store.pilot?.baselineNote
  // );

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

  const previewSignal = resolvePreviewSignal(
    previewId,
    pendingSignals,
    reviewedSignals
  );
  const previewMissing = Boolean(previewId) && !previewSignal;
  const clearPreviewHref = viewHref("insights", {
    ...queryExtras,
    status: statusFilter,
    type: typeFilter === "all" ? null : typeFilter,
    page: page > 1 ? String(page) : null,
    preview: null,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <ClearStaleSyncFailedParams shouldClear={staleSyncFailedParam} />
      {(demo || hasSyncFailure || showImportBanner) ? (
        <div className="scroll-region flex max-h-[30%] shrink-0 flex-col gap-3 lg:max-h-[40%]">
          {demo ? (
            <div
              className="status-banner status-banner-accent shrink-0"
              role="status"
              aria-live="polite"
            >
              <p className="text-copy-14 text-sio-fg-base">
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
              <p className="text-copy-14 text-sio-fg-base">
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
              <p className="text-copy-14 text-sio-fg-base">
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
        </div>
      ) : null}

      {/* 7-day pilot strip — restore later with design refresh
      <Week1PilotStrip
        surface="insights"
        reviewedCount={reviewedCount}
        hasDay1={hasDay1}
        hasMidWeekUpload={hasMidWeekUpload}
        hasBaseline={hasBaseline}
      />
      */}

      {/* Signal Score strip — restore later if needed
      <SignalScoreSummary score={backendScore} compact />
      */}

      {/* Mobile: equal-height queue | preview (each scrolls); lg+: side-by-side */}
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:grid-rows-1 lg:gap-4">
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <SignalQueue
            pendingSignals={pendingSignals}
            reviewedSignals={reviewedSignals}
            queueError={queueError}
            statusFilter={statusFilter}
            typeFilter={typeFilter}
            page={page}
            previewId={previewId}
            queryExtras={queryExtras}
          />
        </div>
        <div
          id="signal-preview"
          className="flex min-h-0 min-w-0 flex-col overflow-hidden scroll-mt-4"
        >
          {previewMissing ? (
            <div
              className="panel scroll-region flex flex-1 flex-col items-center justify-center px-4 py-8 text-center sm:px-6 sm:py-10"
              role="status"
            >
              <p className="text-heading-16 text-sio-fg-base">
                Signal not in this queue
              </p>
              <p className="mt-1.5 max-w-sm text-pretty text-copy-14 text-sio-fg-subtle">
                The preview id is missing from Neon pending and reviewed
                signals. Clear preview or pick another row.
              </p>
              <Link href={clearPreviewHref} className="btn-secondary mt-4">
                Clear Preview
              </Link>
            </div>
          ) : (
            <SignalPreviewPanel signal={previewSignal} />
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-sio-border-base pt-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:pt-3">
        <p className="min-w-0 truncate text-label-13 text-sio-fg-subtle">
          Queue · Neon needs-review ·{" "}
          <span className="text-sio-fg-base" translate="no">
            {store.tenant.name}
          </span>
          {pilot.opportunityLift !== 0 ? (
            <>
              {" · "}
              <span className="tabular text-sio-fg-base">
                Lift {pilot.opportunityLift >= 0 ? "+" : ""}
                {pilot.opportunityLift}
              </span>
            </>
          ) : null}
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <PartnerDemoButton
            className="btn-secondary"
            label="Run Partner Demo"
          />
          <ReDetectButton />
          <Link href={viewHref("eval")} className="btn-secondary shrink-0">
            Open Eval
          </Link>
        </div>
      </div>
    </div>
  );
}

function resolvePreviewSignal(
  previewId: string | null | undefined,
  pendingSignals: Signal[],
  reviewedSignals: Signal[]
): Signal | null {
  if (!previewId) return null;
  const fromPending = pendingSignals.find((s) => s.id === previewId);
  if (fromPending) return fromPending;
  return reviewedSignals.find((s) => s.id === previewId) ?? null;
}
