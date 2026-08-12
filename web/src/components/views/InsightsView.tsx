import Link from "next/link";
import { ClearStaleSyncFailedParams } from "@/components/ClearStaleSyncFailedParams";
import { BoltIcon } from "@/components/icons/BoltIcon";
import { ExternalIcon } from "@/components/icons/ExternalIcon";
import { PartnerDemoButton } from "@/components/PartnerDemoButton";
import { ReDetectButton } from "@/components/ReDetectButton";
import { SignalQueue, SignalQueueFilters } from "@/components/SignalQueue";
import { Note, NoteAction, NoteContent } from "@/components/ui/Note";
// Week1PilotStrip + SignalScoreSummary stay off Insights — quiet footer trust line only.
import type { BackendSignalScore } from "@/lib/backend-client";
import { applyBackendSignalScoreToPilot } from "@/lib/eval";
import { formatPercent, customerNameFromExternalId } from "@/lib/format";
import { ZERO_SIGNAL_HINT } from "@/lib/ingest";
import type { NeedsReviewResult } from "@/lib/fetch-needs-review";
import {
  joinNeedsReviewPredictions,
  reviewedSignalsFromStore,
} from "@/lib/join-needs-review";
import { shouldShowSyncFailureBanner } from "@/lib/prediction-sync";
import { viewHref, type StatusFilter, type TypeFilter } from "@/lib/views";
import type { Conversation, Message, StoreData } from "@/lib/types";

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
  const conversationsById: Record<string, Conversation> = {};
  for (const conversation of store.conversations) {
    conversationsById[conversation.id] = conversation;
    const name =
      conversation.customerName?.trim() ||
      customerNameFromExternalId(conversation.externalId);
    if (name) {
      customerNames[conversation.id] = name;
    }
  }
  const messagesByConversationId: Record<string, Message[]> = {};
  for (const message of store.messages) {
    const list = messagesByConversationId[message.conversationId] ?? [];
    list.push(message);
    messagesByConversationId[message.conversationId] = list;
  }
  for (const id of Object.keys(messagesByConversationId)) {
    messagesByConversationId[id].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <ClearStaleSyncFailedParams shouldClear={staleSyncFailedParam} />
      {showImportBanner ? (
        <div className="scroll-region flex max-h-[30%] shrink-0 flex-col gap-2.5 lg:max-h-[40%]">
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
                  ? "Neon sync failed for some predictions — needs-review queue may be incomplete."
                  : "Neon needs-review queue is ready below."}
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
            <h2 className="scroll-mt-4 text-balance text-heading-20 text-sio-fg-base">
              Conversation that needs your attention
            </h2>
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

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <SignalQueue
            pendingSignals={pendingSignals}
            reviewedSignals={reviewedSignals}
            customerNames={customerNames}
            messagesByConversationId={messagesByConversationId}
            conversationsById={conversationsById}
            queueError={queueError}
            statusFilter={statusFilter}
            typeFilter={typeFilter}
            page={page}
            previewId={previewId}
            queryExtras={queryExtras}
            showFilters={false}
          />
        </div>
      </div>
    </div>
  );
}
