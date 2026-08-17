import Link from "next/link";
import { ClearStaleSyncFailedParams } from "@/components/ClearStaleSyncFailedParams";
import { IconInnerShadowTop } from "@/components/icons/IconInnerShadowTop";
import { ExternalIcon } from "@/components/icons/ExternalIcon";
import { PartnerDemoButton } from "@/components/PartnerDemoButton";
import { ReDetectButton } from "@/components/ReDetectButton";
import { OpenConversationHeaderAction } from "@/components/OpenConversationHeaderAction";
import { MarkActedHeaderAction } from "@/components/MarkActedHeaderAction";
import { SignalQueue, SignalQueueFilters } from "@/components/SignalQueue";
import { ViewFrame } from "@/components/ViewFrame";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Note, NoteAction, NoteContent } from "@/components/ui/Note";
import { InsightsQueueMetrics } from "@/components/InsightsQueueMetrics";
// SignalScoreSummary stays off Insights — quiet footer trust line only.
import type { BackendSignalScore } from "@/lib/backend-client";
import {
  customerNameFromExternalId,
  queueSignalSummary,
  signalTypeLabel,
} from "@/lib/format";
import { ZERO_SIGNAL_HINT } from "@/lib/ingest";
import type { NeedsReviewResult } from "@/lib/fetch-needs-review";
import {
  pendingQueueSignals,
  reviewedSignalsFromStore,
} from "@/lib/join-needs-review";
import { shouldShowSyncFailureBanner } from "@/lib/prediction-sync";
import { cadenceActionHref, viewHref, type StatusFilter, type TypeFilter } from "@/lib/views";
import type { Conversation, Message, StoreData } from "@/lib/types";
import {
  cadenceActionCta,
  nextUnactedCorrectId,
  pilotCadenceHelperCopy,
  type PilotCadenceAction,
} from "@/lib/pilot-cadence";

/** Prefer store name; fall back to “Name (channel) …” summary prefix for Neon stubs. */
function resolveCustomerName(
  conversationId: string,
  customerNames: Record<string, string>,
  summary: string,
): string {
  const fromStore = customerNames[conversationId]?.trim();
  if (fromStore) return fromStore;
  const match = summary.match(/^([A-Za-z][A-Za-z .'-]{0,60}?)\s*\(/);
  if (match?.[1]) return match[1].trim();
  return "Customer";
}

export function InsightsView({
  store,
  demo,
  importedCount,
  newSignalCount,
  statusFilter,
  typeFilter,
  page,
  previewId = null,
  needsReview,
  scoreFrom = null,
  syncFailed = 0,
  syncCreated = 0,
  llmAdded = 0,
  llmFailed = 0,
  cadenceAction,
  cadencePreviewId = null,
}: {
  store: StoreData;
  demo?: boolean;
  importedCount?: number | null;
  newSignalCount?: number | null;
  statusFilter: StatusFilter;
  typeFilter: TypeFilter;
  page: number;
  previewId?: string | null;
  /** Reserved for Eval / pilot chrome — not shown on this strip. */
  backendScore?: BackendSignalScore | null;
  needsReview: NeedsReviewResult;
  /** Preserve Eval `?scoreFrom=` across queue filters. */
  scoreFrom?: string | null;
  syncFailed?: number;
  syncCreated?: number;
  llmAdded?: number;
  llmFailed?: number;
  cadenceAction: PilotCadenceAction;
  /** First Correct-not-Acted signal for cadence Mark Acted deep links. */
  cadencePreviewId?: string | null;
}) {
  const queueError = needsReview.ok ? null : needsReview.error;
  const pendingSignals = needsReview.ok
    ? pendingQueueSignals(needsReview.predictions, store.signals)
    : store.signals.filter((s) => !s.feedback);
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
    llmAdded: llmAdded > 0 ? String(llmAdded) : null,
    llmFailed: llmFailed > 0 ? String(llmFailed) : null,
    scoreFrom,
  };

  // Same resolution as SignalQueue — deep links ignore active filters.
  const previewSignal = previewId
    ? (pendingSignals.find((s) => s.id === previewId) ??
      reviewedSignals.find((s) => s.id === previewId) ??
      null)
    : null;
  const previewCustomerName = previewSignal
    ? resolveCustomerName(
        previewSignal.conversationId,
        customerNames,
        previewSignal.summary || "",
      )
    : null;
  const previewMessages = previewSignal
    ? (messagesByConversationId[previewSignal.conversationId] ?? [])
    : [];
  const reviewOpen = Boolean(previewSignal && previewCustomerName != null);
  const breadcrumbPageLabel = (() => {
    if (!previewSignal || previewCustomerName == null) return null;
    const who = previewCustomerName.trim() || "Customer";
    if (who !== "Customer") return who;
    return (
      queueSignalSummary(previewSignal.summary || "", who).trim() ||
      previewSignal.summary?.trim() ||
      "Signal"
    );
  })();
  // Clear `?preview=` while preserving filters / banners.
  const backToQueueHref = viewHref("insights", {
    ...queryExtras,
    status: statusFilter === "all" ? null : statusFilter,
    type: typeFilter === "all" ? null : typeFilter,
    page: page > 1 ? String(page) : null,
    preview: null,
  });
  const cadenceHref = cadenceActionHref(cadenceAction, {
    scoreFrom,
    preview: cadencePreviewId,
  });

  return (
    <ViewFrame>
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
                  : pendingSignals.length === 0
                    ? "Import finished — open Filters or re-run detection if the queue stays empty."
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

      <Note>
        <NoteContent className="text-sio-fg-base">
          <div className="flex min-w-0 items-center gap-2">
            <IconInnerShadowTop className="size-5 shrink-0 text-black" />
            <span
              className="min-w-0 truncate text-base font-semibold"
              title={store.tenant.name}
              translate="no"
            >
              {store.tenant.name}
            </span>
          </div>
        </NoteContent>
        <NoteAction
          aria-label="Queue actions"
          className="flex-col items-stretch md:flex-row md:items-center"
        >
          <PartnerDemoButton
            className="btn-secondary w-full md:w-auto md:border-transparent md:bg-sio-bg-inverse md:text-sio-fg-on-color md:hover:border-transparent md:hover:bg-black md:disabled:border-transparent md:disabled:bg-sio-bg-disabled md:disabled:text-sio-fg-muted"
            label="Run Partner Demo"
          />
          <ReDetectButton className="w-full md:w-auto" />
          <Link
            href={viewHref("eval", { scoreFrom })}
            className="btn-secondary w-full md:w-auto"
          >
            <ExternalIcon className="size-3.5 shrink-0" />
            Open Eval
          </Link>
        </NoteAction>
      </Note>

      <InsightsQueueMetrics
        conversationCount={store.conversations.length}
        signals={store.signals}
        pendingSignals={pendingSignals}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 flex-col gap-2 min-[540px]:flex-row min-[540px]:items-end min-[540px]:justify-between min-[540px]:gap-4">
          <div className="min-w-0">
            {reviewOpen && breadcrumbPageLabel ? (
              <Breadcrumb aria-label="Insights review" className="scroll-mt-4">
                <BreadcrumbList className="text-balance text-copy-14 font-medium sm:gap-2">
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link
                        href={backToQueueHref}
                        scroll={false}
                        className="rounded-sm font-medium text-sio-fg-muted outline-none transition-colors duration-150 hover:text-sio-fg-base focus-visible:shadow-[0_0_0_2px_var(--sio-bg-base),0_0_0_4px_var(--sio-focus-accent)]"
                      >
                        Insights Queue
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="text-sio-fg-muted [&>svg]:size-3.5" />
                  <BreadcrumbItem>
                    <BreadcrumbPage
                      className="max-w-[16rem] truncate font-medium text-sio-fg-base sm:max-w-xs"
                      translate="no"
                    >
                      {breadcrumbPageLabel}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            ) : pendingSignals.length > 0 ? (
              <h2 className="scroll-mt-4 text-balance text-heading-20 text-sio-fg-base">
                Conversation that needs your attention
              </h2>
            ) : reviewedSignals.length > 0 ? (
              <div className="min-w-0">
                <h2 className="scroll-mt-4 text-balance text-heading-20 text-sio-fg-base">
                  {cadenceAction.id === "acted"
                    ? "Mark Acted on Correct Reviews"
                    : "No Conversations Need Review"}
                </h2>
                <p className="mt-1 max-w-xl text-pretty text-label-13 text-sio-fg-subtle">
                  {pilotCadenceHelperCopy("insights", cadenceAction)}{" "}
                  <Link href={cadenceHref} className="link-accent">
                    {cadenceActionCta(cadenceAction)}
                  </Link>
                </p>
              </div>
            ) : (
              <h2 className="scroll-mt-4 text-balance text-heading-20 text-sio-fg-base">
                Shadow Mode Queue
              </h2>
            )}
          </div>
          <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 min-[540px]:w-auto">
            {previewSignal && previewCustomerName != null ? (
              <>
                <OpenConversationHeaderAction
                  messages={previewMessages}
                  customerName={previewCustomerName}
                  typeLabel={signalTypeLabel(previewSignal.type)}
                  summary={previewSignal.summary || ""}
                />
                <MarkActedHeaderAction
                  signal={previewSignal}
                  nextPreviewId={nextUnactedCorrectId(
                    reviewedSignals,
                    previewSignal.id,
                  )}
                  scoreFrom={scoreFrom}
                />
              </>
            ) : (
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
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <SignalQueue
            pendingSignals={pendingSignals}
            reviewedSignals={reviewedSignals}
            customerNames={customerNames}
            conversationsById={conversationsById}
            queueError={queueError}
            statusFilter={statusFilter}
            typeFilter={typeFilter}
            page={page}
            previewId={previewId}
            queryExtras={queryExtras}
            showFilters={false}
            pendingClear={
              cadenceAction.id === "reviews"
                ? null
                : {
                    description: pilotCadenceHelperCopy(
                      "insights",
                      cadenceAction,
                    ),
                    href: cadenceHref,
                    label: cadenceActionCta(cadenceAction),
                  }
            }
          />
        </div>
      </div>
    </ViewFrame>
  );
}
