import Link from "next/link";
import { ClearStaleSyncFailedParams } from "@/components/ClearStaleSyncFailedParams";
import { ReDetectButton } from "@/components/ReDetectButton";
import { OpenConversationHeaderAction } from "@/components/OpenConversationHeaderAction";
import { MarkActedHeaderAction } from "@/components/MarkActedHeaderAction";
import {
  InsightsModeSwap,
  SignalQueue,
  SignalQueueFilters,
} from "@/components/SignalQueue";
import { ViewFrame } from "@/components/ViewFrame";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
import type { TenantSignalsResult } from "@/lib/fetch-tenant-signals";
import {
  mergeOverlayChats,
  type HydratedChats,
} from "@/lib/hydrate-conversations";
import {
  applyChatEvidenceToSignals,
  filterPendingWithChat,
  pendingQueueSignals,
  reviewedQueueSignals,
  reviewedSignalsFromStore,
} from "@/lib/join-needs-review";
import { shouldShowSyncFailureBanner } from "@/lib/prediction-sync";
import {
  cadenceActionHref,
  statusQueryValue,
  viewHref,
  type StatusFilter,
  type TypeFilter,
  type WorkspaceMode,
} from "@/lib/views";
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

/** Next pending id after `currentId` (wraps; excludes current). */
function nextPendingId(
  pending: { id: string }[],
  currentId: string,
): string | null {
  const n = pending.length;
  if (n === 0) return null;
  const start = pending.findIndex((s) => s.id === currentId);
  const from = start >= 0 ? start : 0;
  for (let i = 1; i <= n; i++) {
    const signal = pending[(from + i) % n];
    if (signal.id !== currentId) return signal.id;
  }
  return null;
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
  tenantSignals,
  overlayChats = null,
  scoreFrom = null,
  syncFailed = 0,
  syncCreated = 0,
  llmAdded = 0,
  llmFailed = 0,
  cadenceAction,
  cadencePreviewId = null,
  workspaceMode = "shadow",
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
  tenantSignals: TenantSignalsResult;
  /** Request-scoped Neon chats when JSON misses conversation rows. */
  overlayChats?: HydratedChats | null;
  /** Preserve Eval `?scoreFrom=` across queue filters. */
  scoreFrom?: string | null;
  syncFailed?: number;
  syncCreated?: number;
  llmAdded?: number;
  llmFailed?: number;
  cadenceAction: PilotCadenceAction;
  /** First Correct-not-Acted signal for cadence Mark Acted deep links. */
  cadencePreviewId?: string | null;
  /** Action Mode keeps Follow-up Act queue in the URL. */
  workspaceMode?: WorkspaceMode;
}) {
  const queueError = needsReview.ok ? null : needsReview.error;
  const tenantSignalsError = tenantSignals.ok ? null : tenantSignals.error;
  const pendingJoined = needsReview.ok
    ? pendingQueueSignals(needsReview.predictions, store.signals)
    : store.signals.filter((s) => !s.feedback);
  const reviewedJoined = tenantSignals.ok
    ? reviewedQueueSignals(tenantSignals.rows, store.signals)
    : reviewedSignalsFromStore(store.signals);
  const chats = mergeOverlayChats(
    store.conversations,
    store.messages,
    overlayChats,
  );
  const pendingSignals = applyChatEvidenceToSignals(
    filterPendingWithChat(pendingJoined, chats.conversations),
    chats,
    store.taxonomyOverrides,
  );
  const reviewedSignals = applyChatEvidenceToSignals(
    reviewedJoined,
    chats,
    store.taxonomyOverrides,
  );
  const customerNames: Record<string, string> = {};
  const conversationsById: Record<string, Conversation> = {};
  for (const conversation of chats.conversations) {
    conversationsById[conversation.id] = conversation;
    const name =
      conversation.customerName?.trim() ||
      customerNameFromExternalId(conversation.externalId);
    if (name) {
      customerNames[conversation.id] = name;
    }
  }
  const messagesByConversationId: Record<string, Message[]> = {};
  for (const message of chats.messages) {
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
    mode: workspaceMode === "action" ? "action" : null,
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
  // Clear `?preview=` while preserving filters / banners / Action Mode.
  const backToQueueHref = viewHref("insights", {
    ...queryExtras,
    status: statusQueryValue(statusFilter, workspaceMode),
    type: typeFilter === "all" ? null : typeFilter,
    page: page > 1 ? String(page) : null,
    preview: null,
  });
  const cadenceHref = cadenceActionHref(cadenceAction, {
    scoreFrom,
    preview: cadencePreviewId,
  });
  const followUpHref = viewHref("insights", {
    ...queryExtras,
    status: "followup",
  });
  const pendingHref = viewHref("insights", {
    ...queryExtras,
    status: "new",
  });
  const showQuietReDetect =
    Boolean(queueError) || pendingSignals.length === 0;

  const cadenceEmpty = {
    description: pilotCadenceHelperCopy("insights", cadenceAction),
    href: cadenceHref,
    label: cadenceActionCta(cadenceAction),
  };
  // Pending empty next step (mid-week Upload, etc.) — also used when Correct is
  // empty and there is nothing pending to review (same panel copy).
  const pendingClear =
    cadenceAction.id === "reviews" ? null : cadenceEmpty;
  const followUpEmpty =
    pendingSignals.length > 0
      ? {
          description: "Review pending detections first.",
          href: pendingHref,
          label: "Review Pending",
        }
      : pendingClear;
  const queueProps = {
    pendingSignals,
    reviewedSignals,
    customerNames,
    conversationsById,
    queueError,
    tenantSignalsError,
    statusFilter,
    typeFilter,
    page,
    queryExtras,
    showFilters: false as const,
    pendingClear,
    followUpEmpty,
    doneEmpty: {
      description:
        "Mark Acted on Correct reviews to complete the suggested step (does not send).",
      href: followUpHref,
      label: "Needs Follow-Up",
    },
  };

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
                <ReDetectButton />
                <Link href={viewHref("upload")} className="btn-secondary">
                  Upload Another File
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <InsightsModeSwap
        mode={reviewOpen ? "review" : "list"}
        reviewKey={reviewOpen ? previewId : null}
        list={
          <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
            <div className="flex shrink-0 flex-col gap-3 min-[540px]:flex-row min-[540px]:items-center min-[540px]:justify-between min-[540px]:gap-4">
              <div className="min-w-0">
                <h2 className="scroll-mt-4 text-balance text-heading-20 text-sio-fg-base">
                  Conversation that needs your attention
                </h2>
              </div>
              <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 min-[540px]:w-auto">
                <SignalQueueFilters
                  pendingSignals={pendingSignals}
                  reviewedSignals={reviewedSignals}
                  queueError={queueError}
                  statusFilter={statusFilter}
                  typeFilter={typeFilter}
                  page={page}
                  previewId={reviewOpen ? null : previewId}
                  queryExtras={queryExtras}
                />
                {showQuietReDetect && !zeroSignalsImport ? (
                  <ReDetectButton />
                ) : null}
              </div>
            </div>
            <InsightsQueueMetrics
              conversationCount={chats.conversations.length}
              signals={[
                ...pendingSignals,
                ...reviewedSignals.filter(
                  (signal) => !pendingSignals.some((pending) => pending.id === signal.id),
                ),
              ]}
              pendingSignals={pendingSignals}
            />
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <SignalQueue
                {...queueProps}
                previewId={reviewOpen ? null : previewId}
              />
            </div>
          </div>
        }
        review={
          <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
            <div className="flex shrink-0 flex-col gap-3 min-[540px]:flex-row min-[540px]:items-center min-[540px]:justify-between min-[540px]:gap-4">
              <div className="min-w-0">
                {breadcrumbPageLabel ? (
                  <Breadcrumb
                    aria-label="Insights review"
                    className="scroll-mt-4"
                  >
                    <BreadcrumbList className="text-balance text-copy-14 font-medium sm:gap-2.5">
                      <BreadcrumbItem>
                        <BreadcrumbLink asChild>
                          <Link
                            href={backToQueueHref}
                            scroll={false}
                            className="rounded-[var(--radius-control)] font-medium text-sio-fg-muted outline-none transition-colors duration-150 hover:text-sio-fg-base focus-visible:shadow-[var(--focus-ring)]"
                          >
                            Insights Queue
                          </Link>
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator className="text-sio-fg-muted [&>svg]:size-3.5" />
                      <BreadcrumbItem>
                        <BreadcrumbPage
                          className="max-w-[min(16rem,calc(100vw-8rem))] truncate font-medium text-sio-fg-base sm:max-w-xs"
                          translate="no"
                        >
                          {breadcrumbPageLabel}
                        </BreadcrumbPage>
                      </BreadcrumbItem>
                    </BreadcrumbList>
                  </Breadcrumb>
                ) : (
                  <h2 className="scroll-mt-4 text-balance text-heading-20 text-sio-fg-base">
                    Conversation that needs your attention
                  </h2>
                )}
              </div>
              <div className="flex w-full min-w-0 shrink-0 flex-wrap items-center justify-end gap-2 min-[540px]:w-auto">
                {previewSignal && previewCustomerName != null ? (
                  <>
                    <OpenConversationHeaderAction
                      messages={previewMessages}
                      customerName={previewCustomerName}
                      typeLabel={signalTypeLabel(previewSignal.type)}
                      summary={previewSignal.summary || ""}
                    />
                    <MarkActedHeaderAction
                      key={previewSignal.id}
                      signal={previewSignal}
                      nextPreviewId={nextUnactedCorrectId(
                        reviewedSignals,
                        previewSignal.id,
                      )}
                      nextPendingPreviewId={nextPendingId(
                        pendingSignals,
                        previewSignal.id,
                      )}
                      statusFilter={statusFilter}
                      scoreFrom={scoreFrom}
                      mode={workspaceMode}
                    />
                  </>
                ) : null}
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <SignalQueue {...queueProps} previewId={previewId} />
            </div>
          </div>
        }
      />
    </ViewFrame>
  );
}
