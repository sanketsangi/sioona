import Link from "next/link";
import { ClearStaleSyncFailedParams } from "@/components/ClearStaleSyncFailedParams";
import { BoltIcon } from "@/components/icons/BoltIcon";
import { ExternalIcon } from "@/components/icons/ExternalIcon";
import { PartnerDemoButton } from "@/components/PartnerDemoButton";
import { ReDetectButton } from "@/components/ReDetectButton";
import { SignalPreviewPanel } from "@/components/SignalPreviewPanel";
import { SignalQueue, SignalQueueFilters } from "@/components/SignalQueue";
import { Note, NoteAction, NoteContent } from "@/components/ui/Note";
// Week1PilotStrip + SignalScoreSummary stay off Insights — quiet footer trust line only.
import type { BackendSignalScore } from "@/lib/backend-client";
import { applyBackendSignalScoreToPilot } from "@/lib/eval";
import { formatPercent } from "@/lib/format";
import { ZERO_SIGNAL_HINT } from "@/lib/ingest";
import type { NeedsReviewResult } from "@/lib/fetch-needs-review";
import {
  joinNeedsReviewPredictions,
  reviewedSignalsFromStore,
} from "@/lib/join-needs-review";
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
  const customerNames: Record<string, string> = {};
  for (const conversation of store.conversations) {
    if (conversation.customerName) {
      customerNames[conversation.id] = conversation.customerName;
    }
  }
  const scoreLabel =
    backendScore != null ? formatPercent(backendScore.signal_score) : null;

  const showImportBanner =
    importedCount != null &&
    !Number.isNaN(importedCount) &&
    newSignalCount != null &&
    !Number.isNaN(newSignalCount);
  const zeroSignalsImport = showImportBanner && newSignalCount === 0;
  const hasSyncFailure = shouldShowSyncFailureBanner(syncFailed, store.signals);
  const staleSyncFailedParam = syncFailed > 0 && !hasSyncFailure;

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
    reviewedSignals,
  );
  const previewMissing = Boolean(previewId) && !previewSignal;
  const showPreviewPane = previewMissing || previewSignal != null;
  const previewMessages = previewSignal
    ? store.messages
        .filter((m) => m.conversationId === previewSignal.conversationId)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    : [];
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
      {demo || hasSyncFailure || showImportBanner ? (
        <div className="scroll-region flex max-h-[30%] shrink-0 flex-col gap-2.5 lg:max-h-[40%]">
          {demo ? (
            <div
              className="status-banner status-banner-accent shrink-0"
              role="status"
              aria-live="polite"
            >
              <p className="text-copy-14 text-sio-fg-base">
                Partner demo ready
              </p>
              <p className="mt-0.5 text-pretty text-label-13 text-sio-fg-subtle">
                Review Neon pending below, then open Eval for precision and
                lift.
              </p>
            </div>
          ) : null}

          {hasSyncFailure ? (
            <div
              className="status-banner status-banner-warning shrink-0"
              role="alert"
            >
              <p className="text-copy-14 text-sio-fg-base">
                Neon dual-write incomplete —{" "}
                <span className="tabular">
                  {syncFailed} prediction{syncFailed === 1 ? "" : "s"}
                </span>{" "}
                not written
                {syncCreated > 0 ? (
                  <span className="tabular"> ({syncCreated} succeeded)</span>
                ) : null}
                .
              </p>
              <p className="mt-0.5 text-pretty text-label-13 text-sio-fg-subtle">
                Local import does not mean the pending queue is ready. Start
                FastAPI (<span translate="no">BACKEND_URL</span>), then Re-run
                Detection.
              </p>
              <div className="mt-2.5">
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
              <p className="tabular text-copy-14 text-sio-fg-base">
                Imported {importedCount} conversations · {newSignalCount} local
                signals
              </p>
              <p className="mt-0.5 text-pretty text-label-13 text-sio-fg-subtle">
                {zeroSignalsImport
                  ? ZERO_SIGNAL_HINT
                  : hasSyncFailure
                    ? "Neon sync failed for some predictions — pending queue may be incomplete."
                    : "Neon pending queue is ready to review below."}
              </p>
              {zeroSignalsImport ? (
                <div className="mt-2.5 flex flex-wrap gap-2">
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

      <Note icon={<BoltIcon />}>
        <NoteContent>
          <p
            className="min-w-0 truncate"
            title={[
              "Queue · Neon needs-review",
              store.tenant.name,
              scoreLabel ? `Score ${scoreLabel}` : null,
              pilot.opportunityLift !== 0
                ? `Lift ${pilot.opportunityLift >= 0 ? "+" : ""}${pilot.opportunityLift}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            <span className="text-sio-fg-muted">Queue</span>
            <span className="text-sio-fg-muted" aria-hidden>
              {" "}
              ·{" "}
            </span>
            Neon needs-review
            <span className="text-sio-fg-muted" aria-hidden>
              {" "}
              ·{" "}
            </span>
            <span className="text-sio-fg-base" translate="no">
              {store.tenant.name}
            </span>
            {scoreLabel ? (
              <>
                <span className="text-sio-fg-muted" aria-hidden>
                  {" "}
                  ·{" "}
                </span>
                <span className="tabular text-sio-fg-base">
                  Score {scoreLabel}
                </span>
              </>
            ) : null}
            {pilot.opportunityLift !== 0 ? (
              <>
                <span className="text-sio-fg-muted" aria-hidden>
                  {" "}
                  ·{" "}
                </span>
                <span className="tabular text-sio-fg-base">
                  Lift {pilot.opportunityLift >= 0 ? "+" : ""}
                  {pilot.opportunityLift}
                </span>
              </>
            ) : null}
          </p>
        </NoteContent>
        <NoteAction aria-label="Queue actions">
          <PartnerDemoButton className="btn-primary" label="Run Partner Demo" />
          <ReDetectButton />
          <Link href={viewHref("eval")} className="btn-secondary">
            <ExternalIcon className="size-3.5 shrink-0" />
            Open Eval
          </Link>
        </NoteAction>
      </Note>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h2 className="scroll-mt-4 text-balance text-heading-16 text-sio-fg-base">
              Needs Attention
            </h2>
            <p className="mt-0.5 text-label-13 text-sio-fg-muted">
              Review Neon pending signals in Shadow Mode
            </p>
          </div>
          <SignalQueueFilters
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

        {/* Soft canvas; each queue row is its own quiet .panel */}
        <div className="panel-group flex min-h-0 flex-1 flex-col overflow-hidden p-2.5 sm:p-3">
          <div
            className={
              showPreviewPane
                ? "grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:grid-rows-1 lg:gap-4"
                : "flex min-h-0 flex-1 flex-col"
            }
          >
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <SignalQueue
                pendingSignals={pendingSignals}
                reviewedSignals={reviewedSignals}
                customerNames={customerNames}
                queueError={queueError}
                statusFilter={statusFilter}
                typeFilter={typeFilter}
                page={page}
                previewId={previewId}
                queryExtras={queryExtras}
                showFilters={false}
              />
            </div>
            {showPreviewPane ? (
              <div
                id="signal-preview"
                className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden scroll-mt-4"
              >
                {previewMissing ? (
                  <div
                    className="panel scroll-region flex flex-1 flex-col items-center justify-center px-4 py-8 text-center sm:px-6 sm:py-10"
                    role="status"
                  >
                    <p className="text-heading-16 text-sio-fg-base">
                      Signal Not in This Queue
                    </p>
                    <p className="mt-1.5 max-w-sm text-pretty text-label-13 text-sio-fg-muted">
                      The preview id is missing from Neon pending and reviewed
                      signals. Clear preview or pick another row.
                    </p>
                    <Link
                      href={clearPreviewHref}
                      className="btn-secondary mt-4"
                    >
                      Clear Preview
                    </Link>
                  </div>
                ) : (
                  <SignalPreviewPanel
                    signal={previewSignal}
                    messages={previewMessages}
                    detailExtras={{
                      ...queryExtras,
                      status: statusFilter,
                      type: typeFilter === "all" ? null : typeFilter,
                      page: page > 1 ? String(page) : null,
                      preview: previewSignal?.id ?? null,
                    }}
                  />
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function resolvePreviewSignal(
  previewId: string | null | undefined,
  pendingSignals: Signal[],
  reviewedSignals: Signal[],
): Signal | null {
  if (!previewId) return null;
  const fromPending = pendingSignals.find((s) => s.id === previewId);
  if (fromPending) return fromPending;
  return reviewedSignals.find((s) => s.id === previewId) ?? null;
}
