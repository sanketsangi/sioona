import Link from "next/link";
import { CanonicalizeInsightsStatus } from "@/components/CanonicalizeInsightsStatus";
import { ClearStaleSyncFailedParams } from "@/components/ClearStaleSyncFailedParams";
import { ReDetectButton } from "@/components/ReDetectButton";
import { MarkActedHeaderAction } from "@/components/MarkActedHeaderAction";
import { OpenConversationHeaderAction } from "@/components/OpenConversationHeaderAction";
import { ConversationDrawerControlProvider } from "@/components/conversation-drawer-control";
import { ReviewWalkHeader } from "@/components/ReviewWalkHeader";
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
import { InsightsPartnerDemoAction } from "@/components/InsightsPartnerDemoAction";
import { InsightsQueueMetrics } from "@/components/InsightsQueueMetrics";
import { InsightsShadowTip } from "@/components/InsightsShadowTip";
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
  queueSignalsForFilter,
  resolvePreviewSignal,
  reviewedQueueSignals,
  reviewedSignalsFromStore,
} from "@/lib/join-needs-review";
import { shouldShowSyncFailureBanner } from "@/lib/prediction-sync";
import { buildSignalReviewTriage } from "@/lib/review-triage";
import {
  cadenceActionHref,
  pendingReviewWalkHref,
  skipPendingPreviewId,
  statusQueryValue,
  viewHref,
  type ActionFilter,
  type StatusFilter,
  type TypeFilter,
  type WorkspaceMode,
} from "@/lib/views";
import type { Conversation, Message, Signal, StoreData } from "@/lib/types";
import {
  cadenceActionCta,
  nextUnactedCorrectId,
  pilotCadenceHelperCopy,
  type PilotCadenceAction,
} from "@/lib/pilot-cadence";
import {
  vaultFileEmptyNext,
  vaultFileMatchesKeepSet,
} from "@/lib/vault-file";
import { isVaultShowcaseFile } from "@/lib/vault-showcase";
import { VaultShowcaseLoader } from "@/components/VaultShowcaseLoader";

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
  jsonKeepSet = false,
  statusFilter,
  statusOmitted = false,
  typeFilter,
  actionFilter = "all",
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
  backendScore = null,
  vaultFile = null,
  precomputedPending = null,
  precomputedReviewed = null,
}: {
  store: StoreData;
  demo?: boolean;
  importedCount?: number | null;
  newSignalCount?: number | null;
  /** Replace-ingest landing: hide leftover Neon stubs until prune finishes. */
  jsonKeepSet?: boolean;
  statusFilter: StatusFilter;
  /** Request URL omitted `status` — client may canonicalize via replaceState. */
  statusOmitted?: boolean;
  typeFilter: TypeFilter;
  actionFilter?: ActionFilter;
  page: number;
  previewId?: string | null;
  /** Windowed keep-set score — list n / ≥5 footer only, not SignalScoreSummary. */
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
  /** Vault `?file=` — scope queue to that keep-set name when it matches. */
  vaultFile?: string | null;
  /** From page.tsx — avoid recomputing the same joins for cadence + view. */
  precomputedPending?: Signal[] | null;
  precomputedReviewed?: Signal[] | null;
}) {
  const keepSetMatches =
    !vaultFile ||
    vaultFileMatchesKeepSet(vaultFile, store.pilot?.lastUploadedFileName);
  const vaultMismatch = Boolean(vaultFile && !keepSetMatches);
  /** Sample / Partner Demo — auto wipe+seed instead of empty Upload CTA. */
  const vaultShowcaseLoading = Boolean(
    vaultMismatch && vaultFile && isVaultShowcaseFile(vaultFile),
  );
  const vaultEmpty =
    vaultMismatch && vaultFile && !isVaultShowcaseFile(vaultFile)
      ? vaultFileEmptyNext(vaultFile)
      : null;
  const queueError = needsReview.ok ? null : needsReview.error;
  const tenantSignalsError = tenantSignals.ok ? null : tenantSignals.error;
  const pendingJoined =
    precomputedPending ??
    (needsReview.ok
      ? pendingQueueSignals(
          needsReview.predictions,
          store.signals,
          tenantSignals.ok ? tenantSignals.rows : undefined,
        )
      : store.signals.filter((s) => !s.feedback));
  const reviewedJoined =
    precomputedReviewed ??
    (tenantSignals.ok
      ? reviewedQueueSignals(tenantSignals.rows, store.signals)
      : reviewedSignalsFromStore(store.signals));
  const chats = mergeOverlayChats(
    store.conversations,
    store.messages,
    jsonKeepSet ? null : overlayChats,
  );
  const pendingSignals = vaultMismatch
    ? []
    : applyChatEvidenceToSignals(
        filterPendingWithChat(pendingJoined, chats.conversations),
        chats,
        store.taxonomyOverrides,
      );
  const reviewedSignals = vaultMismatch
    ? []
    : applyChatEvidenceToSignals(
        jsonKeepSet
          ? filterPendingWithChat(reviewedJoined, chats.conversations)
          : reviewedJoined,
        chats,
        store.taxonomyOverrides,
      );
  // Prev / Next / Skip + Mark Acted advances walk the filtered subset
  // (status list is separate; walk is always pending / Follow-up ∩ type ∩ action).
  const supervisedActions = store.supervisedActions ?? [];
  const walkPendingSignals = queueSignalsForFilter({
    pending: pendingSignals,
    reviewed: [],
    status: "new",
    type: typeFilter,
    action: actionFilter,
    supervisedActions,
  }).filtered;
  const walkFollowUpSignals = queueSignalsForFilter({
    pending: [],
    reviewed: reviewedSignals,
    status: "followup",
    type: typeFilter,
    action: actionFilter,
    supervisedActions,
  }).filtered;
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
    replaced: jsonKeepSet ? "1" : null,
    syncFailed: hasSyncFailure ? String(syncFailed) : null,
    syncCreated: hasSyncFailure ? String(syncCreated) : null,
    llmAdded: llmAdded > 0 ? String(llmAdded) : null,
    llmFailed: llmFailed > 0 ? String(llmFailed) : null,
    scoreFrom,
    mode: workspaceMode === "action" ? "action" : null,
    file: vaultFile,
  };

  // Prefer Neon Correct when the same id is also JSON-unreviewed pending.
  const previewSignal = resolvePreviewSignal(
    previewId,
    pendingSignals,
    reviewedSignals,
  );
  const previewCustomerName = previewSignal
    ? resolveCustomerName(
        previewSignal.conversationId,
        customerNames,
        previewSignal.summary || "",
      )
    : null;
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
    action: actionFilter === "all" ? null : actionFilter,
    page: page > 1 ? String(page) : null,
    preview: null,
  });
  const cadenceHref = cadenceActionHref(cadenceAction, {
    scoreFrom,
    preview: cadencePreviewId,
    replaced: jsonKeepSet,
  });
  const followUpHref = viewHref("insights", {
    ...queryExtras,
    status: "followup",
  });
  const pendingHref = viewHref("insights", {
    ...queryExtras,
    status: "new",
  });
  const cadenceEmpty = {
    description: pilotCadenceHelperCopy("insights", cadenceAction),
    href: cadenceHref,
    label: cadenceActionCta(cadenceAction),
  };
  // Pending empty next step (mid-week Upload, etc.) — also used when Correct is
  // empty and there is nothing pending to review (same panel copy).
  const pendingClear = vaultEmpty
    ? {
        title: vaultEmpty.title,
        description: vaultEmpty.description,
        href: vaultEmpty.href,
        label: vaultEmpty.label,
      }
    : cadenceAction.id === "reviews"
      ? null
      : cadenceEmpty;
  const followUpEmpty = vaultEmpty
    ? {
        title: vaultEmpty.title,
        description: vaultEmpty.description,
        href: vaultEmpty.href,
        label: vaultEmpty.label,
      }
    : pendingSignals.length > 0
      ? {
          description: "Review pending detections first.",
          href: pendingHref,
          label: "Review Pending",
        }
      : pendingClear;
  const previewTriage = previewSignal
    ? buildSignalReviewTriage({
        pendingSignals,
        walkPendingSignals,
        previewSignal,
        scoreFrom,
        mode: workspaceMode,
        replaced: jsonKeepSet,
        typeFilter,
        actionFilter,
        file: vaultFile,
      })
    : null;
  const walkHrefOpts = {
    statusFilter,
    typeFilter,
    actionFilter,
    scoreFrom,
    mode: workspaceMode,
    replaced: jsonKeepSet,
    file: vaultFile,
  };
  // Any open ?preview= while filtered needs-review remains — including after
  // Correct / Mark as Acted (follow-up / Done origin). Hide only when the
  // filtered pending walk is empty. Prev/Next/Skip walk filtered pending
  // (type + action); last Skip → filtered list.
  const pendingWalk =
    previewSignal && walkPendingSignals.length > 0
      ? {
          prevHref: previewTriage?.prevPendingPreviewId
            ? pendingReviewWalkHref({
                ...walkHrefOpts,
                previewId: previewTriage.prevPendingPreviewId,
              })
            : null,
          nextHref: previewTriage?.nextPendingPreviewId
            ? pendingReviewWalkHref({
                ...walkHrefOpts,
                previewId: previewTriage.nextPendingPreviewId,
              })
            : null,
          skipHref: pendingReviewWalkHref({
            ...walkHrefOpts,
            previewId: skipPendingPreviewId(
              walkPendingSignals,
              previewSignal.id,
            ),
          }),
        }
      : null;
  // After Mark as Acted: next Correct panel in the filtered Follow-up set,
  // else next filtered pending review.
  // Origin status filter is unused — empty Pending / Follow-up lists are not a destination.
  const actedWalk = previewSignal
    ? {
        nextPreviewId: nextUnactedCorrectId(
          walkFollowUpSignals,
          previewSignal.id,
        ),
        nextPendingPreviewId: previewTriage?.nextPendingPreviewId ?? null,
        statusFilter,
        typeFilter,
        actionFilter,
        scoreFrom,
        mode: workspaceMode,
        replaced: jsonKeepSet,
        file: vaultFile,
      }
    : null;
  const previewMessages = previewSignal
    ? (messagesByConversationId[previewSignal.conversationId] ?? [])
    : [];
  const openConversationAction =
    previewSignal && previewCustomerName != null && previewMessages.length > 0 ? (
      <OpenConversationHeaderAction
        key={`open-conv-${previewSignal.id}`}
        messages={previewMessages}
        customerName={previewCustomerName}
        typeLabel={signalTypeLabel(previewSignal.type)}
        summary={previewSignal.summary}
      />
    ) : null;
  const queueProps = {
    pendingSignals,
    reviewedSignals,
    customerNames,
    conversationsById,
    messagesByConversationId,
    queueError,
    tenantSignalsError,
    statusFilter,
    typeFilter,
    actionFilter,
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
    reviewTriage: previewTriage ?? undefined,
    actedWalk,
    supervisedActions,
  };

  return (
    <ViewFrame className="gap-4">
      <CanonicalizeInsightsStatus
        statusFilter={statusFilter}
        workspaceMode={workspaceMode}
        statusOmitted={statusOmitted}
      />
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
                    ? "Import finished — use the status tabs or re-run detection if the queue stays empty."
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
          <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-4">
            <div className="flex min-w-0 shrink-0 flex-col gap-2">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <h2 className="min-w-0 flex-1 basis-[min(100%,16rem)] scroll-mt-4 text-balance text-heading-20 text-sio-fg-base">
                  Conversation that needs your attention
                </h2>
                <InsightsPartnerDemoAction
                  lastUploadedFileName={store.pilot?.lastUploadedFileName}
                />
              </div>
              <InsightsShadowTip />
            </div>
            {vaultShowcaseLoading && vaultFile ? (
              <VaultShowcaseLoader
                fileName={vaultFile}
                keepSetFileName={store.pilot?.lastUploadedFileName}
              />
            ) : (
              <>
                <InsightsQueueMetrics
                  conversationCount={
                    vaultMismatch ? 0 : chats.conversations.length
                  }
                  signals={[
                    ...pendingSignals,
                    ...reviewedSignals.filter(
                      (signal) =>
                        !pendingSignals.some((pending) => pending.id === signal.id),
                    ),
                  ]}
                  pendingSignals={pendingSignals}
                  reviewedCount={
                    vaultMismatch ? 0 : (backendScore?.reviewed_count ?? null)
                  }
                />
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
                  <div className="flex w-full min-w-0 shrink-0">
                    <SignalQueueFilters
                      pendingSignals={pendingSignals}
                      reviewedSignals={reviewedSignals}
                      queueError={queueError}
                      statusFilter={statusFilter}
                      typeFilter={typeFilter}
                      actionFilter={actionFilter}
                      page={page}
                      previewId={reviewOpen ? null : previewId}
                      queryExtras={queryExtras}
                      supervisedActions={store.supervisedActions ?? []}
                    />
                  </div>
                  <SignalQueue
                    {...queueProps}
                    previewId={reviewOpen ? null : previewId}
                  />
                </div>
              </>
            )}
          </div>
        }
        review={
          <ConversationDrawerControlProvider
            key={previewSignal?.id ?? "no-preview"}
          >
            <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-4">
              <div className="sticky top-0 z-10 flex min-w-0 shrink-0 flex-col gap-3 bg-sio-bg-muted min-[540px]:flex-row min-[540px]:items-end min-[540px]:justify-between min-[540px]:gap-4">
                <div className="min-w-0">
                  {breadcrumbPageLabel ? (
                    <Breadcrumb
                      aria-label="Insights review"
                      className="min-w-0 scroll-mt-4"
                    >
                      <BreadcrumbList className="min-w-0">
                        <BreadcrumbItem>
                          <BreadcrumbLink asChild>
                            <Link
                              href={backToQueueHref}
                              scroll={false}
                              className="inline-flex min-h-11 items-center touch-manipulation md:min-h-6"
                            >
                              Insights Queue
                            </Link>
                          </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem className="min-w-0">
                          <BreadcrumbPage
                            className="text-heading-16 font-medium !text-sio-fg-base ml-2 max-w-[min(16rem,calc(100vw-8rem))] truncate sm:max-w-xs"
                            title={breadcrumbPageLabel}
                            translate="no"
                          >
                            {breadcrumbPageLabel}
                          </BreadcrumbPage>
                        </BreadcrumbItem>
                      </BreadcrumbList>
                    </Breadcrumb>
                  ) : (
                    <h2 className="scroll-mt-4 text-balance text-heading-20 text-sio-fg-base">
                      Insights Queue
                    </h2>
                  )}
                </div>
                <div className="flex w-full min-w-0 shrink-0 flex-wrap items-center justify-end gap-2 min-[540px]:w-auto">
                  {previewSignal && previewCustomerName != null ? (
                    <>
                      {pendingWalk ? (
                        <ReviewWalkHeader
                          prevHref={pendingWalk.prevHref}
                          nextHref={pendingWalk.nextHref}
                          skipHref={pendingWalk.skipHref}
                          openConversation={openConversationAction}
                        />
                      ) : (
                        openConversationAction
                      )}
                      <MarkActedHeaderAction
                        key={previewSignal.id}
                        signal={previewSignal}
                        {...(actedWalk ?? {})}
                      />
                    </>
                  ) : null}
                </div>
              </div>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <SignalQueue {...queueProps} previewId={previewId} />
              </div>
            </div>
          </ConversationDrawerControlProvider>
        }
      />
    </ViewFrame>
  );
}
